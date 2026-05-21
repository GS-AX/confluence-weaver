import { ItemView, WorkspaceLeaf } from 'obsidian';
import { SyncStats } from './types';
import { t } from './i18n';

export const VIEW_TYPE_SYNC_LOG = 'confluence-weaver-sync-log';

export class SyncLogView extends ItemView {
  private stats: SyncStats[] = [];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SYNC_LOG;
  }

  getDisplayText(): string {
    return t('log.title');
  }

  getIcon(): string {
    return 'refresh-cw';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {}

  setStats(stats: SyncStats[]): void {
    this.stats = stats;
    this.render();
  }

  private render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();

    root.createEl('h4', { text: t('log.title'), cls: 'cw-log-heading' });

    if (this.stats.length === 0) {
      root.createEl('p', { text: t('log.noStats'), cls: 'cw-log-empty' });
      return;
    }

    for (const stat of this.stats) {
      const section = root.createEl('div', { cls: 'cw-log-section' });
      section.createEl('h5', { text: stat.profileName, cls: 'cw-log-profile' });

      const table = section.createEl('table', { cls: 'cw-log-table' });
      const addRow = (label: string, value: string | number) => {
        const tr = table.createEl('tr');
        tr.createEl('td', { text: label, cls: 'cw-log-label' });
        tr.createEl('td', { text: String(value), cls: 'cw-log-value' });
      };

      addRow(t('log.created'), stat.created);
      addRow(t('log.updated'), stat.updated);
      addRow(t('log.skipped'), stat.skipped);
      addRow(t('log.errors'), stat.errors);
      addRow(t('log.lastSync'), stat.lastSync ? stat.lastSync.replace('T', ' ').slice(0, 19) : t('log.never'));
    }
  }
}
