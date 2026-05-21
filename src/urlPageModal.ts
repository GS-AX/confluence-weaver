import { App, Modal, Notice, Setting } from 'obsidian';
import type ConfluenceWeaverPlugin from './main';
import { t } from './i18n';

export class UrlPageModal extends Modal {
  private url = '';
  private folder = 'Confluence';
  private includeChildren = false;
  private allDescendants = false;
  private maxPages = 100;

  constructor(app: App, private plugin: ConfluenceWeaverPlugin) {
    super(app);
    this.folder = plugin.settings.profiles[0]?.folder ?? 'Confluence';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: t('modal.url.title') });

    new Setting(contentEl)
      .setName(t('modal.url.url'))
      .setDesc(t('modal.url.url.desc'))
      .addText(text => {
        text
          .setPlaceholder('https://mycompany.atlassian.net/wiki/spaces/DEV/pages/123456')
          .setValue(this.url)
          .onChange(v => { this.url = v.trim(); });
        text.inputEl.addClass('cw-textarea');
      });

    new Setting(contentEl)
      .setName(t('modal.url.folder'))
      .addText(text =>
        text
          .setPlaceholder('Confluence')
          .setValue(this.folder)
          .onChange(v => { this.folder = v.trim(); })
      );

    const childrenSetting = new Setting(contentEl)
      .setName(t('modal.url.children'))
      .setDesc(t('modal.url.children.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.includeChildren)
          .onChange(v => {
            this.includeChildren = v;
            descendantsSetting.settingEl.toggle(v);
            maxPagesSetting.settingEl.toggle(v);
          })
      );

    const descendantsSetting = new Setting(contentEl)
      .setName(t('modal.url.descendants'))
      .setDesc(t('modal.url.descendants.desc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.allDescendants)
          .onChange(v => { this.allDescendants = v; })
      );

    const maxPagesSetting = new Setting(contentEl)
      .setName(t('modal.url.maxPages'))
      .addText(text =>
        text
          .setValue(String(this.maxPages))
          .onChange(v => { this.maxPages = Math.max(1, parseInt(v) || 100); })
      );

    // Hide child-related settings until toggle is on
    descendantsSetting.settingEl.toggle(this.includeChildren);
    maxPagesSetting.settingEl.toggle(this.includeChildren);

    // Suppress unused-variable warning — childrenSetting drives the toggle
    void childrenSetting;

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText(t('modal.url.fetch'))
          .setCta()
          .onClick(() => this.submit())
      )
      .addButton(btn =>
        btn
          .setButtonText(t('modal.cancel'))
          .onClick(() => this.close())
      );
  }

  private async submit(): Promise<void> {
    if (!this.url) {
      new Notice(t('notice.url.invalidUrl'));
      return;
    }
    this.close();
    await this.plugin.fetchByUrl(
      this.url,
      this.folder,
      this.includeChildren,
      this.allDescendants,
      this.maxPages
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
