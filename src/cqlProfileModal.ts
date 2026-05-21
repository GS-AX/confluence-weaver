import { App, Modal, Setting } from 'obsidian';
import { CqlProfile } from './types';
import { t } from './i18n';

export class CqlProfileModal extends Modal {
  private profile: CqlProfile;
  private readonly onSave: (profile: CqlProfile) => void;

  constructor(app: App, profile: CqlProfile, onSave: (profile: CqlProfile) => void) {
    super(app);
    this.profile = { ...profile };
    this.onSave = onSave;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const isNew = !this.profile.id;
    contentEl.createEl('h2', { text: isNew ? t('modal.newProfile') : t('modal.editProfile') });

    new Setting(contentEl)
      .setName(t('modal.profileName'))
      .addText(text =>
        text
          .setValue(this.profile.name)
          .onChange(v => { this.profile.name = v; })
      );

    new Setting(contentEl)
      .setName(t('modal.cql'))
      .addTextArea(area => {
        area
          .setValue(this.profile.cql)
          .onChange(v => { this.profile.cql = v; });
        area.inputEl.rows = 4;
        area.inputEl.addClass('cw-textarea');
      });

    new Setting(contentEl)
      .setName(t('modal.folder'))
      .setDesc(t('modal.folder.desc'))
      .addText(text =>
        text
          .setPlaceholder('Confluence')
          .setValue(this.profile.folder)
          .onChange(v => { this.profile.folder = v; })
      );

    new Setting(contentEl)
      .setName(t('modal.maxPages'))
      .addText(text =>
        text
          .setValue(String(this.profile.maxPages))
          .onChange(v => { this.profile.maxPages = Math.max(1, parseInt(v) || 50); })
      );

    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText(t('modal.save'))
          .setCta()
          .onClick(() => {
            if (isNew) this.profile.id = Date.now().toString();
            this.onSave(this.profile);
            this.close();
          })
      )
      .addButton(btn =>
        btn
          .setButtonText(t('modal.cancel'))
          .onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
