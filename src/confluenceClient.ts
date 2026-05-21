import { ConfluencePage, ConfluenceWeaverSettings } from './types';

export class ConfluenceClient {
  constructor(private settings: ConfluenceWeaverSettings) {}

  private get baseUrl(): string {
    return this.settings.domain.replace(/\/$/, '');
  }

  authHeader(): string {
    if (this.settings.authMode === 'basic') {
      const creds = btoa(`${this.settings.email}:${this.settings.token}`);
      return `Basic ${creds}`;
    }
    return `Bearer ${this.settings.token}`;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const hint = body.slice(0, 200);
      throw new Error(`${resp.status} ${resp.statusText}${hint ? ': ' + hint : ''}`);
    }

    return resp.json() as Promise<T>;
  }

  async testConnection(): Promise<void> {
    await this.get<unknown>('/rest/api/space?limit=1');
  }

  async searchCQL(cql: string, limit = 50): Promise<ConfluencePage[]> {
    const data = await this.get<{ results: ConfluencePage[] }>(
      `/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=version,space,ancestors`
    );
    return data.results ?? [];
  }

  async getPage(id: string): Promise<ConfluencePage> {
    return this.get<ConfluencePage>(
      `/rest/api/content/${id}?expand=body.storage,version,ancestors,space,metadata.labels,history`
    );
  }

  async getPageProperties(id: string): Promise<Record<string, unknown>> {
    const data = await this.get<{ results: Array<{ key: string; value: unknown }> }>(
      `/rest/api/content/${id}/property?limit=50`
    );
    return Object.fromEntries((data.results ?? []).map(p => [p.key, p.value]));
  }
}
