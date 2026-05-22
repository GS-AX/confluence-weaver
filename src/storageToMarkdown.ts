/**
 * Converts Confluence Storage Format (XHTML-based) to Markdown.
 *
 * Strategy:
 *  1. Pre-process Confluence-specific ac:/ri: macros with regex before DOM parsing.
 *  2. Parse remaining HTML with DOMParser.
 *  3. Walk the DOM and emit Markdown.
 */

export interface ConvertOptions {
  /** Replace <ac:link> with Obsidian [[wiki-link]]. Default: true */
  wikiLinks?: boolean;
  /** Maps attachment filename → vault-relative path for local image embeds */
  attachmentMap?: Map<string, string>;
}

function escAttr(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function storageToMarkdown(html: string, options: ConvertOptions = {}): string {
  const { wikiLinks = true } = options;
  let s = html;

  // ── Task lists ────────────────────────────────────────────────────────────
  s = s.replace(
    /<ac:task-list[^>]*>([\s\S]*?)<\/ac:task-list>/gi,
    (_m, inner) => {
      const tasks: string[] = [];
      const taskRe = /<ac:task[^>]*>([\s\S]*?)<\/ac:task>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = taskRe.exec(inner)) !== null) {
        const taskInner = tm[1];
        const statusMatch = taskInner.match(/<ac:task-status[^>]*>([\s\S]*?)<\/ac:task-status>/i);
        const bodyMatch   = taskInner.match(/<ac:task-body[^>]*>([\s\S]*?)<\/ac:task-body>/i);
        const done = statusMatch?.[1]?.trim().toLowerCase() === 'complete';
        const body = bodyMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
        tasks.push(`- [${done ? 'x' : ' '}] ${body}`);
      }
      return tasks.join('\n') + '\n';
    }
  );

  // ── Status label: <ac:status ac:title="IN PROGRESS" ac:colour="Blue"/> ───
  s = s.replace(
    /<ac:status\b[^>]*\bac:title="([^"]*)"[^>]*\/?>/gi,
    (_m, title) => `**${title}**`
  );

  // ── Emoticons → strip ─────────────────────────────────────────────────────
  s = s.replace(/<ac:emoticon[^>]*\/>/gi, '');

  // ── TOC macro → strip ─────────────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="toc"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    ''
  );

  // ── Code macro ────────────────────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const langMatch  = inner.match(/<ac:parameter[^>]*\bac:name="language"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const lang       = langMatch ? langMatch[1].trim() : '';
      const cdataMatch = inner.match(/<ac:plain-text-body[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
      const textMatch  = inner.match(/<ac:plain-text-body[^>]*>([\s\S]*?)<\/ac:plain-text-body>/i);
      const code       = (cdataMatch ?? textMatch)?.[1] ?? '';
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }
  );

  // ── Noformat (plain text block) ───────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="noformat"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const cdataMatch = inner.match(/<ac:plain-text-body[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
      const textMatch  = inner.match(/<ac:plain-text-body[^>]*>([\s\S]*?)<\/ac:plain-text-body>/i);
      const code       = (cdataMatch ?? textMatch)?.[1] ?? '';
      return `\n\`\`\`\n${code}\n\`\`\`\n`;
    }
  );

  // ── Column → extract content + separator (must run BEFORE section) ────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="column"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      return (bodyMatch ? bodyMatch[1] : '') + '\n<hr/>\n';
    }
  );

  // ── Section → unwrap (columns inside already emitted separators) ──────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="section"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? bodyMatch[1] : '';
    }
  );

  // ── Panel → Obsidian callout ──────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="panel"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const titleParam = inner.match(/<ac:parameter[^>]*\bac:name="title"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const title      = titleParam?.[1]?.trim() ?? '';
      const bodyMatch  = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      const body       = bodyMatch ? bodyMatch[1] : inner;
      return `<blockquote data-cw-type="abstract" data-cw-title="${escAttr(title)}">${body}</blockquote>`;
    }
  );

  // ── Expand → collapsible Obsidian callout ─────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="expand"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const titleParam = inner.match(/<ac:parameter[^>]*\bac:name="title"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const title      = titleParam?.[1]?.trim() ?? 'Details';
      const bodyMatch  = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      const body       = bodyMatch ? bodyMatch[1] : inner;
      return `<blockquote data-cw-type="abstract" data-cw-title="${escAttr(title)}" data-cw-collapse="true">${body}</blockquote>`;
    }
  );

  // ── Info / Note / Warning / Tip → typed Obsidian callout ─────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="(info|note|warning|tip)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, type, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      const body      = bodyMatch ? bodyMatch[1] : inner;
      return `<blockquote data-cw-type="${type}" data-cw-title="">${body}</blockquote>`;
    }
  );

  // ── Excerpt → transparent (just content) ─────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="excerpt"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? bodyMatch[1] : '';
    }
  );

  // ── Excerpt-include → italic reference ───────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="excerpt-include"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const pageMatch = inner.match(/ri:content-title="([^"]*)"/i);
      const page      = pageMatch?.[1] ?? '';
      return page ? `\n> *Excerpt from [[${page}]]*\n` : '';
    }
  );

  // ── Include page → Obsidian embed ────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="include"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const pageMatch = inner.match(/ri:content-title="([^"]*)"/i);
      const page      = pageMatch?.[1] ?? '';
      return page ? `\n![[${page}]]\n` : '';
    }
  );

  // ── Jira issue macro → bold issue key ────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="jira"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const keyMatch = inner.match(/<ac:parameter[^>]*\bac:name="key"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const key      = keyMatch?.[1]?.trim() ?? '';
      return key ? `**${key}**` : '';
    }
  );

  // ── Anchor macro → HTML anchor ────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="anchor"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const nameMatch = inner.match(/<ac:parameter[^>]*\bac:name="0"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const name      = nameMatch?.[1]?.trim() ?? '';
      return name ? `<a id="${name}"></a>` : '';
    }
  );

  // ── Quote macro → blockquote ──────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="quote"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      const body      = bodyMatch ? bodyMatch[1] : inner;
      return `<blockquote>${body}</blockquote>`;
    }
  );

  // ── Divider → horizontal rule ─────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="divider"[^>]*(?:\/>|>[\s\S]*?<\/ac:structured-macro>)/gi,
    '\n<hr/>\n'
  );

  // ── Widget connector → link ───────────────────────────────────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="widget"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const urlMatch = inner.match(/<ac:parameter[^>]*\bac:name="url"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const url      = urlMatch?.[1]?.trim() ?? '';
      return url ? `[Embedded content](${url})` : '';
    }
  );

  // ── Strip: macros with no meaningful Markdown equivalent ─────────────────
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="(?:children|pagetree|page-tree|recently-updated|activity-stream|livesearch|profile-picture|roadmap|chart|html|iframe|navitabs|create-from-template|blog-posts|contributors|contributors-summary|space-list|recently-updated-dashboard|details|details-summary)"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    ''
  );

  // ── Generic remaining macros — keep rich-text-body content if present ─────
  s = s.replace(
    /<ac:structured-macro[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? bodyMatch[1] : '';
    }
  );

  // ── User mentions — Server (ri:username) ──────────────────────────────────
  s = s.replace(
    /<ac:link[^>]*>\s*<ri:user[^>]*\bri:username="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>[\s\S]*?<\/ac:link-body>)?\s*<\/ac:link>/gi,
    (_m, username) => `@${username}`
  );

  // ── User mentions — Cloud (ri:account-id), use link-body display name ─────
  s = s.replace(
    /<ac:link[^>]*>\s*<ri:user[^>]*\bri:account-id="[^"]*"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
    (_m, body) => {
      const name = body?.replace(/<[^>]+>/g, '').trim();
      return name ? `@${name}` : '@user';
    }
  );

  // ── Confluence internal page link ─────────────────────────────────────────
  if (wikiLinks) {
    s = s.replace(
      /<ac:link[^>]*>\s*<ri:page[^>]*\bri:content-title="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
      (_m, title) => `[[${title}]]`
    );
  } else {
    s = s.replace(
      /<ac:link[^>]*>\s*<ri:page[^>]*\bri:content-title="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
      (_m, title, body) => body?.replace(/<[^>]+>/g, '') || title
    );
  }

  // ── External URL link ─────────────────────────────────────────────────────
  s = s.replace(
    /<ac:link[^>]*>\s*<ri:url[^>]*\bri:value="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
    (_m, url, body) => {
      const text = body?.replace(/<[^>]+>/g, '').trim() || url;
      return `[${text}](${url})`;
    }
  );

  // ── Attachment image ──────────────────────────────────────────────────────
  s = s.replace(
    /<ac:image[^>]*>\s*<ri:attachment[^>]*\bri:filename="([^"]*)"[^>]*\/?>\s*<\/ac:image>/gi,
    (_m, filename) => {
      const vaultPath = options.attachmentMap?.get(filename);
      return vaultPath ? `![[${vaultPath}]]` : `![${filename}](${filename})`;
    }
  );

  // ── External URL image ────────────────────────────────────────────────────
  s = s.replace(
    /<ac:image[^>]*>\s*<ri:url[^>]*\bri:value="([^"]*)"[^>]*\/?>\s*<\/ac:image>/gi,
    (_m, url) => `![](${url})`
  );

  // ── Strip remaining ac:/ri: tags ─────────────────────────────────────────
  s = s.replace(/<\/?(?:ac|ri):[^>]*>/gi, '');

  const parser = new DOMParser();
  const doc    = parser.parseFromString(`<body>${s}</body>`, 'text/html');

  return nodeToMd(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el  = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map(nodeToMd).join('');

  switch (tag) {
    case 'h1': return `\n# ${kids().trim()}\n`;
    case 'h2': return `\n## ${kids().trim()}\n`;
    case 'h3': return `\n### ${kids().trim()}\n`;
    case 'h4': return `\n#### ${kids().trim()}\n`;
    case 'h5': return `\n##### ${kids().trim()}\n`;
    case 'h6': return `\n###### ${kids().trim()}\n`;
    case 'p':  return `\n${kids()}\n`;
    case 'br': return '\n';
    case 'hr': return '\n---\n';

    case 'strong':
    case 'b': return `**${kids()}**`;

    case 'em':
    case 'i': return `*${kids()}*`;

    case 'del':
    case 's': return `~~${kids()}~~`;

    case 'code': {
      const text = kids();
      return text.includes('\n') ? `\`\`\`\n${text}\n\`\`\`` : `\`${text}\``;
    }

    case 'pre': {
      const codeEl = el.querySelector('code');
      if (codeEl) {
        const lang = (codeEl.className.match(/language-(\w+)/) ?? [])[1] ?? '';
        return `\n\`\`\`${lang}\n${codeEl.textContent ?? ''}\n\`\`\`\n`;
      }
      return `\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n`;
    }

    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const text = kids().trim();
      return href ? `[${text}](${href})` : text;
    }

    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    }

    case 'ul': return `\n${renderList(el, false)}\n`;
    case 'ol': return `\n${renderList(el, true)}\n`;
    case 'li': return kids();

    case 'blockquote': {
      const cwType     = el.getAttribute('data-cw-type');
      const cwTitle    = el.getAttribute('data-cw-title') ?? '';
      const cwCollapse = el.getAttribute('data-cw-collapse') === 'true';
      const content    = kids().trim();
      if (cwType) {
        const collapse = cwCollapse ? '-' : '';
        const lines    = content.split('\n').map(l => `> ${l}`).join('\n');
        return `\n> [!${cwType}]${collapse} ${cwTitle}\n${lines}\n`;
      }
      return `\n> ${content.replace(/\n/g, '\n> ')}\n`;
    }

    case 'table': return `\n${renderTable(el)}\n`;
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr': return kids();

    default: return kids();
  }
}

function renderList(el: Element, ordered: boolean): string {
  const lines: string[] = [];
  let idx = 1;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = (child as Element).tagName.toLowerCase();
    if (tag !== 'li') continue;
    const prefix  = ordered ? `${idx++}. ` : '- ';
    const content = nodeToMd(child).trim().replace(/\n/g, '\n   ');
    lines.push(`${prefix}${content}`);
  }
  return lines.join('\n');
}

function renderTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const parsed: string[][] = rows.map(row =>
    Array.from(row.querySelectorAll('th, td')).map(cell =>
      nodeToMd(cell).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')
    )
  );

  const colCount = Math.max(...parsed.map(r => r.length));
  parsed.forEach(row => { while (row.length < colCount) row.push(''); });

  const sep = Array(colCount).fill('---');
  return [
    `| ${parsed[0].join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...parsed.slice(1).map(r => `| ${r.join(' | ')} |`),
  ].join('\n');
}
