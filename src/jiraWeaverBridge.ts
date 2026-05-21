import { App, TFile } from 'obsidian';

interface ConfluenceFileEntry {
  /** Vault-relative path, without .md extension, for use in [[wiki-link]] */
  wikiName: string;
  /** Full Confluence page URL stored in frontmatter */
  confluenceUrl: string;
}

/**
 * Scans every Markdown file in the vault that has `confluence_url` in its
 * frontmatter and builds a URL → wiki-name lookup map.
 */
async function buildUrlMap(app: App): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const files = app.vault.getMarkdownFiles();

  for (const file of files) {
    const content = await app.vault.read(file);
    const urlMatch = content.match(/^confluence_url:\s*["']?([^\s"'\n]+)["']?/m);
    if (!urlMatch) continue;

    const rawUrl = urlMatch[1].trim();
    // Strip trailing slash and query/fragment so matching is consistent
    const normalizedUrl = rawUrl.replace(/[?#].*$/, '').replace(/\/$/, '');
    // wiki-name = filename without extension
    const wikiName = file.path.replace(/\.md$/, '');
    map.set(normalizedUrl, wikiName);
  }

  return map;
}

/**
 * Returns true if the file looks like a Jira Weaver page
 * (has `jira_id:` in its YAML frontmatter).
 */
function isJiraWeaverFile(content: string): boolean {
  return /^jira_id:/m.test(content);
}

/**
 * Given a body string (everything after the frontmatter's closing `---`),
 * replace bare Confluence URLs and Markdown-linked Confluence URLs with
 * Obsidian [[wiki-link]]s using the provided lookup map.
 *
 * Handles:
 *   - https://domain/wiki/...  (bare URL)
 *   - [text](https://domain/wiki/...) (Markdown link)
 *   Both are replaced with [[wikiName]] or [text]([[wikiName]]) respectively.
 */
function replaceConfluenceUrls(body: string, urlMap: Map<string, string>): { result: string; count: number } {
  let count = 0;
  let result = body;

  for (const [url, wikiName] of urlMap) {
    // Escape URL for use in regex
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Markdown link: [text](url) or [text](url/trailing/path)
    const mdLinkRe = new RegExp(`\\[([^\\]]+)\\]\\(${escaped}[^)]*\\)`, 'g');
    result = result.replace(mdLinkRe, (_m, text) => {
      count++;
      return `[[${wikiName}|${text}]]`;
    });

    // Bare URL (not inside parentheses — avoid double-replacing)
    const bareRe = new RegExp(`(?<!\\()${escaped}(?:[^\\s)\\]"]*)?`, 'g');
    result = result.replace(bareRe, () => {
      count++;
      return `[[${wikiName}]]`;
    });
  }

  return { result, count };
}

/**
 * Main entry point: scan vault for Jira Weaver pages, replace Confluence
 * URLs found in their body with [[wiki-link]]s pointing to Confluence Weaver files.
 *
 * Returns the total number of URLs replaced.
 */
export async function linkJiraPages(app: App): Promise<number> {
  const urlMap = await buildUrlMap(app);
  if (urlMap.size === 0) return 0;

  const files = app.vault.getMarkdownFiles();
  let totalReplaced = 0;

  for (const file of files) {
    const content = await app.vault.read(file);
    if (!isJiraWeaverFile(content)) continue;

    // Split off frontmatter so we don't mangle YAML
    const fmEnd = findFrontmatterEnd(content);
    const frontmatter = content.slice(0, fmEnd);
    const body = content.slice(fmEnd);

    const { result, count } = replaceConfluenceUrls(body, urlMap);
    if (count === 0) continue;

    await app.vault.modify(file, frontmatter + result);
    totalReplaced += count;
  }

  return totalReplaced;
}

/** Returns the index just after the closing `---` of the YAML frontmatter. */
function findFrontmatterEnd(content: string): number {
  if (!content.startsWith('---')) return 0;
  const rest = content.slice(3);
  const closeIdx = rest.search(/\n---\s*\n/);
  if (closeIdx === -1) return 0;
  return closeIdx + 3 + '\n---\n'.length;
}
