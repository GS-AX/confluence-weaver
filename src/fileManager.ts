import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { ConfluencePage } from './types';
import { slugify } from './fieldResolver';

export class FileManager {
  constructor(private app: App) {}

  async ensureFolder(folderPath: string): Promise<void> {
    const path = normalizePath(folderPath);
    if (!path || path === '.') return;

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;

    // Ensure parent exists first
    const parts = path.split('/');
    if (parts.length > 1) {
      await this.ensureFolder(parts.slice(0, -1).join('/'));
    }

    const after = this.app.vault.getAbstractFileByPath(path);
    if (!after) {
      try {
        await this.app.vault.createFolder(path);
      } catch (e) {
        if (!(e as Error).message?.includes('already exists')) throw e;
      }
    }
  }

  async readFile(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? this.app.vault.read(file) : null;
  }

  async writeFile(path: string, content: string): Promise<'created' | 'updated'> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return 'updated';
    }

    const parts = normalized.split('/');
    if (parts.length > 1) {
      await this.ensureFolder(parts.slice(0, -1).join('/'));
    }
    await this.app.vault.create(normalized, content);
    return 'created';
  }

  resolveFilePath(
    page: ConfluencePage,
    baseFolder: string,
    folderHierarchy: boolean
  ): string {
    const fileName = `${page.id}_${slugify(page.title)}.md`;

    if (folderHierarchy && page.ancestors?.length > 0) {
      const ancestorPath = page.ancestors.map(a => slugify(a.title)).join('/');
      const folder = baseFolder ? `${baseFolder}/${ancestorPath}` : ancestorPath;
      return normalizePath(`${folder}/${fileName}`);
    }

    return baseFolder
      ? normalizePath(`${baseFolder}/${fileName}`)
      : normalizePath(fileName);
  }
}
