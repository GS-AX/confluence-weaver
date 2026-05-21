import { ConfluencePage, ConfluenceWeaverSettings, SECTION_MARKER } from './types';
import { yamlString, yamlDate, slugify } from './fieldResolver';
import { storageToMarkdown } from './storageToMarkdown';

export function buildMarkdown(
  page: ConfluencePage,
  settings: ConfluenceWeaverSettings,
  existingContent?: string
): string {
  const frontmatter = buildFrontmatter(page, settings);
  const body = buildBody(page, settings);
  const freshContent = `${frontmatter}\n${body}\n\n${SECTION_MARKER}\n`;

  if (!existingContent) return freshContent;

  const markerIdx = existingContent.indexOf(SECTION_MARKER);
  if (markerIdx !== -1) {
    // Preserve user notes written after the marker
    const userNotes = existingContent.slice(markerIdx + SECTION_MARKER.length);
    return `${frontmatter}\n${body}\n\n${SECTION_MARKER}${userNotes}`;
  }

  return settings.missingMarker === 'skip' ? existingContent : freshContent;
}

function buildFrontmatter(page: ConfluencePage, settings: ConfluenceWeaverSettings): string {
  const domain = settings.domain.replace(/\/$/, '');
  const webui = page._links?.webui ?? '';
  const url = webui.startsWith('http') ? webui : `${domain}${webui}`;

  const labels = page.metadata?.labels?.results?.map(l => l.name) ?? [];
  const parent = page.ancestors?.[page.ancestors.length - 1];
  const author =
    page.history?.createdBy?.displayName ??
    page.history?.createdBy?.username ??
    '';
  const created = yamlDate(page.history?.createdDate ?? '');
  const updated = yamlDate(page.version?.when ?? '');

  const lines: string[] = [
    '---',
    `confluence_id: ${yamlString(page.id)}`,
    `confluence_url: ${yamlString(url)}`,
    `title: ${yamlString(page.title)}`,
    `space: ${yamlString(page.space?.key ?? '')}`,
    `space_name: ${yamlString(page.space?.name ?? '')}`,
    `author: ${yamlString(author)}`,
    `created: "${created}"`,
    `updated: "${updated}"`,
    `version: ${page.version?.number ?? 0}`,
  ];

  if (labels.length > 0) {
    lines.push('labels:');
    labels.forEach(l => lines.push(`  - ${yamlString(l)}`));
  } else {
    lines.push('labels: []');
  }

  if (parent) {
    lines.push(`parent: "[[${parent.id}_${slugify(parent.title)}]]"`);
  }

  // Custom field mappings
  for (const mapping of settings.fieldMappings ?? []) {
    const value = resolvePath(page as unknown as Record<string, unknown>, mapping.sourcePath);
    if (value !== undefined && value !== null) {
      const serialized = Array.isArray(value)
        ? value.map(v => String(v))
        : String(value);

      if (Array.isArray(serialized)) {
        lines.push(`${mapping.frontmatterKey}:`);
        serialized.forEach(v => lines.push(`  - ${yamlString(v)}`));
      } else {
        lines.push(`${mapping.frontmatterKey}: ${yamlString(serialized)}`);
      }
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function buildBody(page: ConfluencePage, settings: ConfluenceWeaverSettings): string {
  let body = storageToMarkdown(page.body?.storage?.value ?? '', {
    wikiLinks: settings.wikiLinks,
  });

  if (settings.maxBodyLength > 0 && body.length > settings.maxBodyLength) {
    body = body.slice(0, settings.maxBodyLength) + '\n\n…(truncated)';
  }

  return body;
}

/** Resolve a dot-notation path into an object, e.g. "space.key" → page.space.key */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur !== null && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
