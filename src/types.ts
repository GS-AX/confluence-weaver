export interface CqlProfile {
  id: string;
  name: string;
  cql: string;
  folder: string;
  maxPages: number;
  enabled: boolean;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  metadata: { mediaType: string };
  _links: { download: string };
}

export interface FieldMapping {
  /** Dot-notation path into the Confluence page JSON, e.g. "space.key" */
  sourcePath: string;
  /** Frontmatter key to write, e.g. "project" */
  frontmatterKey: string;
}

export interface ConfluenceWeaverSettings {
  domain: string;
  authMode: 'basic' | 'bearer';
  email: string;
  token: string;
  profiles: CqlProfile[];
  syncOnStartup: boolean;
  syncInterval: number;
  missingMarker: 'overwrite' | 'skip';
  folderHierarchy: boolean;
  maxBodyLength: number;
  wikiLinks: boolean;
  fieldMappings: FieldMapping[];
  downloadAttachments: boolean;
  language: 'auto' | 'en' | 'ko' | 'ja' | 'zh';
}

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  space: { key: string; name: string };
  version: { number: number; when: string };
  ancestors: Array<{ id: string; title: string }>;
  body?: { storage: { value: string } };
  metadata?: { labels: { results: Array<{ name: string }> } };
  _links: { webui: string; base?: string };
  history?: {
    createdDate: string;
    createdBy: { displayName: string; accountId?: string; username?: string };
  };
}

export interface SyncStats {
  profileId: string;
  profileName: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  lastSync: string;
}

export const SECTION_MARKER = '[confluence-weaver section end]';
