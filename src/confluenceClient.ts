import { requestUrl } from 'obsidian';
import { ConfluenceAttachment, ConfluencePage, ConfluenceWeaverSettings } from './types';

export class ConfluenceClient {
  constructor(private settings: ConfluenceWeaverSettings) {}

  private get baseUrl(): string {
    return this.settings.domain.replace(/\/$/, '');
  }

  authHeader(): string {
    if (this.settings.authMode === 'basic') {
      const creds = Buffer.from(`${this.settings.email}:${this.settings.token}`).toString('base64');
      return `Basic ${creds}`;
    }
    return `Bearer ${this.settings.token}`;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await requestUrl({
      url,
      method: 'GET',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (resp.status >= 400) {
      const preview = (resp.text ?? '').slice(0, 200);
      throw new Error(`${resp.status}${preview ? ': ' + preview : ''}`);
    }

    return resp.json as T;
  }

  async testConnection(): Promise<void> {
    await this.get<unknown>('/rest/api/space?limit=1');
  }

  async searchCQL(
    cql: string,
    limit = 50,
    expand = 'version,space,ancestors'
  ): Promise<ConfluencePage[]> {
    const data = await this.get<{ results: ConfluencePage[] }>(
      `/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=${encodeURIComponent(expand)}`
    );
    return data.results ?? [];
  }

  async getPages(
    ids: string[],
    expand = 'body.storage,version,ancestors,space,metadata.labels,history'
  ): Promise<ConfluencePage[]> {
    if (ids.length === 0) return [];
    const batchSize = 50;
    const pages: ConfluencePage[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const cql = `id in (${batchIds.map(id => `"${id}"`).join(',')})`;
      const results = await this.searchCQL(cql, batchIds.length, expand);
      pages.push(...results);
    }
    return pages;
  }

  async getPage(id: string): Promise<ConfluencePage> {
    return this.get<ConfluencePage>(
      `/rest/api/content/${id}?expand=body.storage,version,ancestors,space,metadata.labels,history`
    );
  }

  /**
   * Extract a page ID from any Confluence URL format:
   *  - /pages/123456/...          (Cloud & DC path)
   *  - pageId=123456              (DC viewpage.action query string)
   *  - /display/SPACE/Title       (DC display URL — resolves via title search)
   * Returns null when no ID can be extracted without an API call.
   */
  parsePageId(url: string): string | null {
    const pathMatch = url.match(/\/pages\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    const queryMatch = url.match(/[?&]pageId=(\d+)/);
    if (queryMatch) return queryMatch[1];

    return null;
  }

  /**
   * Resolve a Confluence /display/SPACE/Title URL by searching for the title.
   * Used as fallback when parsePageId returns null.
   */
  async resolveDisplayUrl(url: string): Promise<string | null> {
    const displayMatch = url.match(/\/display\/([^/?#]+)\/([^?#]+)/);
    if (!displayMatch) return null;

    const spaceKey = decodeURIComponent(displayMatch[1]);
    const title = decodeURIComponent(displayMatch[2].replace(/\+/g, ' '));
    const cql = `space = "${spaceKey}" AND title = "${title.replace(/"/g, '\\"')}"`;

    const results = await this.searchCQL(cql, 1);
    return results[0]?.id ?? null;
  }

  /** Fetch direct child pages (no body — IDs only for batch fetch). */
  async getChildPageIds(parentId: string): Promise<string[]> {
    let start = 0;
    const limit = 50;
    const ids: string[] = [];

    while (true) {
      const data = await this.get<{ results: Array<{ id: string }>; size: number }>(
        `/rest/api/content/${parentId}/child/page?limit=${limit}&start=${start}`
      );
      const results = data.results ?? [];
      ids.push(...results.map(r => r.id));
      if (results.length < limit) break;
      start += limit;
    }

    return ids;
  }

  /**
   * Collect all descendant page IDs using BFS.
   * Stops when maxPages is reached to prevent runaway fetches.
   */
  async collectDescendantIds(rootId: string, maxPages: number): Promise<string[]> {
    const all: string[] = [];
    const queue = [rootId];

    while (queue.length > 0 && all.length < maxPages) {
      const id = queue.shift()!;
      const children = await this.getChildPageIds(id);
      for (const cid of children) {
        if (all.length >= maxPages) break;
        all.push(cid);
        queue.push(cid);
      }
    }

    return all;
  }

  async getPageProperties(id: string): Promise<Record<string, unknown>> {
    const data = await this.get<{ results: Array<{ key: string; value: unknown }> }>(
      `/rest/api/content/${id}/property?limit=50`
    );
    return Object.fromEntries((data.results ?? []).map(p => [p.key, p.value]));
  }

  /** Fetch all attachments for a page. Returns image attachments by default. */
  async getPageAttachments(pageId: string, imagesOnly = true): Promise<ConfluenceAttachment[]> {
    let start = 0;
    const limit = 50;
    const results: ConfluenceAttachment[] = [];

    while (true) {
      const data = await this.get<{ results: ConfluenceAttachment[]; size: number }>(
        `/rest/api/content/${pageId}/child/attachment?limit=${limit}&start=${start}&expand=metadata`
      );
      const batch = data.results ?? [];
      for (const att of batch) {
        if (!imagesOnly || att.metadata?.mediaType?.startsWith('image/')) {
          results.push(att);
        }
      }
      if (batch.length < limit) break;
      start += limit;
    }

    return results;
  }

  /** Download a Confluence attachment and return its raw bytes. */
  async downloadAttachment(downloadPath: string): Promise<ArrayBuffer> {
    const url = downloadPath.startsWith('http')
      ? downloadPath
      : `${this.baseUrl}${downloadPath}`;

    const resp = await requestUrl({
      url,
      method: 'GET',
      headers: { Authorization: this.authHeader() },
    });

    if (resp.status >= 400) {
      throw new Error(`${resp.status}: attachment download failed`);
    }

    return resp.arrayBuffer;
  }
}
