import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ConfluenceWeaverPlugin from './main';
import { CqlProfile } from './types';
import { t, setLocale } from './i18n';
import { CqlProfileModal } from './cqlProfileModal';
import { ConfluenceClient } from './confluenceClient';

export class ConfluenceWeaverSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ConfluenceWeaverPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: t('setting.title') });

    new Setting(containerEl)
      .setName(t('setting.language'))
      .setDesc(t('setting.language.desc'))
      .addDropdown(drop =>
        drop
          .addOption('auto', t('setting.language.auto'))
          .addOption('en', t('setting.language.en'))
          .addOption('ko', t('setting.language.ko'))
          .addOption('ja', t('setting.language.ja'))
          .addOption('zh', t('setting.language.zh'))
          .setValue(this.plugin.settings.language)
          .onChange(async v => {
            this.plugin.settings.language = v as 'auto' | 'en' | 'ko' | 'ja' | 'zh';
            await this.plugin.saveSettings();
            setLocale(this.plugin.settings.language);
            this.display();
          })
      );

    // ── Connection ──────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('setting.connection') });

    new Setting(containerEl)
      .setName(t('setting.domain'))
      .setDesc(t('setting.domain.desc'))
      .addText(text =>
        text
          .setPlaceholder('https://mycompany.atlassian.net/wiki')
          .setValue(this.plugin.settings.domain)
          .onChange(async v => {
            this.plugin.settings.domain = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.authMode'))
      .addDropdown(drop =>
        drop
          .addOption('basic', t('setting.authMode.basic'))
          .addOption('bearer', t('setting.authMode.bearer'))
          .setValue(this.plugin.settings.authMode)
          .onChange(async v => {
            this.plugin.settings.authMode = v as 'basic' | 'bearer';
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.authMode === 'basic') {
      new Setting(containerEl)
        .setName(t('setting.email'))
        .setDesc(t('setting.email.desc'))
        .addText(text =>
          text
            .setValue(this.plugin.settings.email)
            .onChange(async v => {
              this.plugin.settings.email = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName(t('setting.token'))
      .setDesc(t('setting.token.desc'))
      .addText(text => {
        text
          .setValue(this.plugin.settings.token)
          .onChange(async v => {
            this.plugin.settings.token = v.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .addButton(btn =>
        btn
          .setButtonText(t('setting.testConnection'))
          .onClick(async () => {
            new Notice(t('notice.connecting'));
            try {
              await new ConfluenceClient(this.plugin.settings).testConnection();
              new Notice(t('notice.connected'));
            } catch (e) {
              new Notice(`${t('notice.connectFailed')}${(e as Error).message}`);
            }
          })
      );

    // ── CQL Profiles ────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('setting.profiles') });

    for (const profile of this.plugin.settings.profiles) {
      const setting = new Setting(containerEl)
        .setName(profile.name || '(unnamed)')
        .setDesc(profile.cql);

      setting.addToggle(toggle =>
        toggle
          .setValue(profile.enabled)
          .onChange(async v => {
            profile.enabled = v;
            await this.plugin.saveSettings();
          })
      );

      setting.addButton(btn =>
        btn
          .setButtonText(t('setting.editProfile'))
          .onClick(() =>
            new CqlProfileModal(this.app, profile, async updated => {
              const idx = this.plugin.settings.profiles.findIndex(p => p.id === updated.id);
              if (idx !== -1) this.plugin.settings.profiles[idx] = updated;
              await this.plugin.saveSettings();
              this.display();
            }).open()
          )
      );

      setting.addButton(btn =>
        btn
          .setButtonText(t('setting.deleteProfile'))
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.profiles = this.plugin.settings.profiles.filter(
              p => p.id !== profile.id
            );
            await this.plugin.saveSettings();
            this.display();
          })
      );
    }

    new Setting(containerEl)
      .addButton(btn =>
        btn
          .setButtonText(t('setting.addProfile'))
          .onClick(() => {
            const blank: CqlProfile = {
              id: '',
              name: '',
              cql: '',
              folder: 'Confluence',
              maxPages: 50,
              enabled: true,
            };
            new CqlProfileModal(this.app, blank, async created => {
              this.plugin.settings.profiles.push(created);
              await this.plugin.saveSettings();
              this.display();
            }).open();
          })
      );

    // ── Sync Settings ────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('setting.sync') });

    new Setting(containerEl)
      .setName(t('setting.syncOnStartup'))
      .setDesc(t('setting.syncOnStartup.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async v => {
            this.plugin.settings.syncOnStartup = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.syncInterval'))
      .setDesc(t('setting.syncInterval.desc'))
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.syncInterval))
          .onChange(async v => {
            this.plugin.settings.syncInterval = Math.min(1440, Math.max(0, parseInt(v) || 0));
            await this.plugin.saveSettings();
            this.plugin.scheduler.restart();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.missingMarker'))
      .setDesc(t('setting.missingMarker.desc'))
      .addDropdown(drop =>
        drop
          .addOption('overwrite', t('setting.missingMarker.overwrite'))
          .addOption('skip', t('setting.missingMarker.skip'))
          .setValue(this.plugin.settings.missingMarker)
          .onChange(async v => {
            this.plugin.settings.missingMarker = v as 'overwrite' | 'skip';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.folderHierarchy'))
      .setDesc(t('setting.folderHierarchy.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.folderHierarchy)
          .onChange(async v => {
            this.plugin.settings.folderHierarchy = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.wikiLinks'))
      .setDesc(t('setting.wikiLinks.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.wikiLinks)
          .onChange(async v => {
            this.plugin.settings.wikiLinks = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.downloadAttachments'))
      .setDesc(t('setting.downloadAttachments.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.downloadAttachments)
          .onChange(async v => {
            this.plugin.settings.downloadAttachments = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Advanced ─────────────────────────────────────────────────
    containerEl.createEl('h3', { text: t('setting.advanced') });

    new Setting(containerEl)
      .setName(t('setting.maxBodyLength'))
      .setDesc(t('setting.maxBodyLength.desc'))
      .addText(text =>
        text
          .setValue(String(this.plugin.settings.maxBodyLength))
          .onChange(async v => {
            this.plugin.settings.maxBodyLength = Math.max(0, parseInt(v) || 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('setting.fieldMappings'))
      .setDesc(t('setting.fieldMappings.desc'))
      .addTextArea(area => {
        const toText = () =>
          (this.plugin.settings.fieldMappings ?? [])
            .map(m => `${m.sourcePath} → ${m.frontmatterKey}`)
            .join('\n');

        area
          .setValue(toText())
          .onChange(async raw => {
            this.plugin.settings.fieldMappings = raw
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.includes('→') || line.includes('->'))
              .map(line => {
                const [src, tgt] = line.split(/→|->/).map(s => s.trim());
                return { sourcePath: src, frontmatterKey: tgt };
              })
              .filter(m => m.sourcePath && m.frontmatterKey);
            await this.plugin.saveSettings();
          });
        area.inputEl.rows = 5;
        area.inputEl.addClass('cw-textarea');
        area.inputEl.addClass('cw-textarea-mono');
      });
  }
}
