import { Notice, Plugin } from 'obsidian';
import { ConfluencePage, ConfluenceWeaverSettings, SyncStats } from './types';
import { linkJiraPages } from './jiraWeaverBridge';
import { UrlPageModal } from './urlPageModal';
import { ConfluenceClient } from './confluenceClient';
import { FileManager } from './fileManager';
import { buildMarkdown } from './markdownBuilder';
import { ConfluenceWeaverSettingTab } from './settings';
import { SyncScheduler } from './syncScheduler';
import { SyncLogView, VIEW_TYPE_SYNC_LOG } from './syncLogView';
import { t, setLocale } from './i18n';

const DEFAULT_SETTINGS: ConfluenceWeaverSettings = {
  domain: '',
  authMode: 'basic',
  email: '',
  token: '',
  profiles: [],
  syncOnStartup: false,
  syncInterval: 0,
  missingMarker: 'overwrite',
  folderHierarchy: false,
  maxBodyLength: 0,
  wikiLinks: true,
  fieldMappings: [],
  downloadAttachments: false,
  language: 'auto',
};

export default class ConfluenceWeaverPlugin extends Plugin {
  settings: ConfluenceWeaverSettings = { ...DEFAULT_SETTINGS };
  scheduler: SyncScheduler = new SyncScheduler(this);
  syncStats: SyncStats[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    setLocale(this.settings.language);

    this.registerView(VIEW_TYPE_SYNC_LOG, leaf => new SyncLogView(leaf));

    this.addCommand({
      id: 'sync-pages',
      name: t('cmd.sync'),
      callback: () => this.syncPages(false),
    });

    this.addCommand({
      id: 'force-sync-pages',
      name: t('cmd.forceSync'),
      callback: () => this.syncPages(true),
    });

    this.addCommand({
      id: 'open-sync-log',
      name: t('cmd.openLog'),
      callback: () => this.openSyncLog(),
    });

    this.addCommand({
      id: 'link-jira-weaver-pages',
      name: t('cmd.linkJira'),
      callback: () => this.runJiraWeaverBridge(),
    });

    this.addCommand({
      id: 'fetch-page-by-url',
      name: t('cmd.fetchByUrl'),
      callback: () => new UrlPageModal(this.app, this).open(),
    });

    this.addSettingTab(new ConfluenceWeaverSettingTab(this.app, this));

    this.scheduler.start();
  }

  onunload(): void {
    this.scheduler.stop();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async syncPages(forceOverwrite: boolean): Promise<void> {
    const active = this.settings.profiles.filter(p => p.enabled);
    if (active.length === 0) {
      new Notice('Confluence Weaver: No enabled CQL profiles.');
      return;
    }
    if (!this.settings.domain || !this.settings.token) {
      new Notice('Confluence Weaver: Configure domain and token in settings first.');
      return;
    }

    new Notice(t('notice.syncing'));

    const client = new ConfluenceClient(this.settings);
    const fm = new FileManager(this.app);
    const allStats: SyncStats[] = [];

    for (const profile of active) {
      const stats: SyncStats = {
        profileId: profile.id,
        profileName: profile.name,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        lastSync: new Date().toISOString(),
      };

      try {
        const pages = await client.searchCQL(
          profile.cql,
          profile.maxPages,
          'body.storage,version,ancestors,space,metadata.labels,history'
        );

        for (const page of pages) {
          try {
            const filePath = fm.resolveFilePath(page, profile.folder, this.settings.folderHierarchy);
            const existing = await fm.readFile(filePath);

            // Incremental sync: skip pages whose version hasn't changed
            if (!forceOverwrite && existing) {
              const versionMatch = existing.match(/^version:\s*(\d+)/m);
              if (versionMatch && parseInt(versionMatch[1]) >= (page.version?.number ?? 0)) {
                stats.skipped++;
                continue;
              }
            }

            const attachmentMap = this.settings.downloadAttachments
              ? await this.downloadPageAttachments(page, profile.folder, client, fm)
              : undefined;

            const content = buildMarkdown(
              page,
              this.settings,
              forceOverwrite ? undefined : existing ?? undefined,
              attachmentMap
            );

            // If buildMarkdown returned existing unchanged (skip-marker case), count as skipped
            if (existing && content === existing) {
              stats.skipped++;
              continue;
            }

            const result = await fm.writeFile(filePath, content);
            result === 'created' ? stats.created++ : stats.updated++;
          } catch (e) {
            console.error(`Confluence Weaver: page ${page.id}`, e);
            stats.errors++;
          }
        }
      } catch (e) {
        console.error(`Confluence Weaver: profile "${profile.name}"`, e);
        new Notice(`${t('notice.syncFailed')}${(e as Error).message}`);
        stats.errors++;
      }

      allStats.push(stats);
    }

    this.syncStats = allStats;
    this.refreshLogView();
    new Notice(t('notice.syncDone'));
  }

  private refreshLogView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SYNC_LOG)) {
      if (leaf.view instanceof SyncLogView) leaf.view.setStats(this.syncStats);
    }
  }

  async fetchByUrl(
    url: string,
    folder: string,
    includeChildren: boolean,
    allDescendants: boolean,
    maxPages: number
  ): Promise<void> {
    if (!this.settings.domain || !this.settings.token) {
      new Notice('Confluence Weaver: Configure domain and token in settings first.');
      return;
    }

    const client = new ConfluenceClient(this.settings);
    const fm = new FileManager(this.app);

    // Resolve page ID from URL
    let rootId = client.parsePageId(url);
    if (!rootId) {
      rootId = await client.resolveDisplayUrl(url);
    }
    if (!rootId) {
      new Notice(t('notice.url.invalidUrl'));
      return;
    }

    new Notice(t('notice.url.fetching'));

    try {
      // Collect all IDs to fetch: root + optional children/descendants
      const idsToFetch: string[] = [rootId];

      if (includeChildren) {
        if (allDescendants) {
          const desc = await client.collectDescendantIds(rootId, maxPages - 1);
          idsToFetch.push(...desc);
        } else {
          const children = await client.getChildPageIds(rootId);
          idsToFetch.push(...children.slice(0, maxPages - 1));
        }
      }

      let created = 0;
      let updated = 0;

      const pages = await client.getPages(
        idsToFetch,
        'body.storage,version,ancestors,space,metadata.labels,history'
      );

      for (const page of pages) {
        try {
          const filePath = fm.resolveFilePath(page, folder, this.settings.folderHierarchy);
          const existing = await fm.readFile(filePath);
          const attachmentMap = this.settings.downloadAttachments
            ? await this.downloadPageAttachments(page, folder, client, fm)
            : undefined;
          const content = buildMarkdown(page, this.settings, existing ?? undefined, attachmentMap);
          if (existing && content === existing) continue;
          const result = await fm.writeFile(filePath, content);
          result === 'created' ? created++ : updated++;
        } catch (e) {
          console.error(`Confluence Weaver: fetch page ${page.id}`, e);
        }
      }

      new Notice(
        t('notice.url.done')
          .replace('{created}', String(created))
          .replace('{updated}', String(updated))
      );
    } catch (e) {
      new Notice(`${t('notice.url.failed')}${(e as Error).message}`);
    }
  }

  /**
   * Download image attachments for a page and return a filename→vaultPath map.
   * Skips files that are already up-to-date (existing binary untouched).
   */
  async downloadPageAttachments(
    page: ConfluencePage,
    baseFolder: string,
    client: ConfluenceClient,
    fm: FileManager
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const attachments = await client.getPageAttachments(page.id);
      for (const att of attachments) {
        const safeName = att.title.replace(/[\\/:*?"<>|]/g, '_');
        const vaultPath = baseFolder
          ? `${baseFolder}/_attachments/${page.id}/${safeName}`
          : `_attachments/${page.id}/${safeName}`;
        try {
          const data = await client.downloadAttachment(att._links.download);
          await fm.writeBinaryFile(vaultPath, data);
          map.set(att.title, vaultPath);
        } catch (e) {
          console.error(`Confluence Weaver: attachment ${att.title}`, e);
        }
      }
    } catch (e) {
      console.error(`Confluence Weaver: getPageAttachments ${page.id}`, e);
    }
    return map;
  }

  async runJiraWeaverBridge(): Promise<void> {
    new Notice(t('notice.linkJira'));
    try {
      const count = await linkJiraPages(this.app);
      new Notice(t('notice.linkJiraDone').replace('{count}', String(count)));
    } catch (e) {
      new Notice(`${t('notice.linkJiraFailed')}${(e as Error).message}`);
    }
  }

  async openSyncLog(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SYNC_LOG);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_SYNC_LOG, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
