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

export function storageToMarkdown(html: string, options: ConvertOptions = {}): string {
  const { wikiLinks = true } = options;
  let s = html;

  // Task lists: <ac:task-list><ac:task>...<ac:task-status>complete</ac:task-status><ac:task-body>text</ac:task-body></ac:task></ac:task-list>
  s = s.replace(
    /<ac:task-list[^>]*>([\s\S]*?)<\/ac:task-list>/gi,
    (_m, inner) => {
      const tasks: string[] = [];
      const taskRe = /<ac:task[^>]*>([\s\S]*?)<\/ac:task>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = taskRe.exec(inner)) !== null) {
        const taskInner = tm[1];
        const statusMatch = taskInner.match(/<ac:task-status[^>]*>([\s\S]*?)<\/ac:task-status>/i);
        const bodyMatch = taskInner.match(/<ac:task-body[^>]*>([\s\S]*?)<\/ac:task-body>/i);
        const done = statusMatch?.[1]?.trim().toLowerCase() === 'complete';
        const body = bodyMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
        tasks.push(`- [${done ? 'x' : ' '}] ${body}`);
      }
      return tasks.join('\n') + '\n';
    }
  );

  // Status label: <ac:status ac:title="IN PROGRESS" ac:colour="Blue"/>
  s = s.replace(
    /<ac:status\b[^>]*\bac:title="([^"]*)"[^>]*\/?>/gi,
    (_m, title) => `**${title}**`
  );

  // Emoticons → strip (keep accessibility)
  s = s.replace(/<ac:emoticon[^>]*\/>/gi, '');

  // TOC macro → strip
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="toc"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,
    ''
  );

  // Code macro: <ac:structured-macro ac:name="code">
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const langMatch = inner.match(/<ac:parameter[^>]*\bac:name="language"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
      const lang = langMatch ? langMatch[1].trim() : '';
      const cdataMatch = inner.match(/<ac:plain-text-body[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
      const textMatch = inner.match(/<ac:plain-text-body[^>]*>([\s\S]*?)<\/ac:plain-text-body>/i);
      const code = (cdataMatch ?? textMatch)?.[1] ?? '';
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    }
  );

  // Info/note/warning/tip panels
  s = s.replace(
    /<ac:structured-macro[^>]*\bac:name="(info|note|warning|tip)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, type, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      const body = bodyMatch ? bodyMatch[1] : inner;
      return `\n> **${type.toUpperCase()}**: ${body.trim()}\n`;
    }
  );

  // Generic remaining macros — keep rich-text-body content if present
  s = s.replace(
    /<ac:structured-macro[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, inner) => {
      const bodyMatch = inner.match(/<ac:rich-text-body[^>]*>([\s\S]*?)<\/ac:rich-text-body>/i);
      return bodyMatch ? bodyMatch[1] : '';
    }
  );

  // Confluence internal page link
  if (wikiLinks) {
    s = s.replace(
      /<ac:link[^>]*>\s*<ri:page[^>]*\bri:content-title="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
      (_m, title) => `[[${title}]]`
    );
  } else {
    // Render as plain text from the link body, or the title
    s = s.replace(
      /<ac:link[^>]*>\s*<ri:page[^>]*\bri:content-title="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
      (_m, title, body) => body?.replace(/<[^>]+>/g, '') || title
    );
  }

  // External URL link
  s = s.replace(
    /<ac:link[^>]*>\s*<ri:url[^>]*\bri:value="([^"]*)"[^>]*\/?>\s*(?:<ac:link-body>([\s\S]*?)<\/ac:link-body>)?\s*<\/ac:link>/gi,
    (_m, url, body) => {
      const text = body?.replace(/<[^>]+>/g, '').trim() || url;
      return `[${text}](${url})`;
    }
  );

  // Attachment image — use local vault path if downloaded, otherwise filename fallback
  s = s.replace(
    /<ac:image[^>]*>\s*<ri:attachment[^>]*\bri:filename="([^"]*)"[^>]*\/?>\s*<\/ac:image>/gi,
    (_m, filename) => {
      const vaultPath = options.attachmentMap?.get(filename);
      return vaultPath ? `![[${vaultPath}]]` : `![${filename}](${filename})`;
    }
  );

  // External URL image
  s = s.replace(
    /<ac:image[^>]*>\s*<ri:url[^>]*\bri:value="([^"]*)"[^>]*\/?>\s*<\/ac:image>/gi,
    (_m, url) => `![](${url})`
  );

  // Strip remaining ac:/ri: tags
  s = s.replace(/<\/?(?:ac|ri):[^>]*>/gi, '');

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${s}</body>`, 'text/html');

  return nodeToMd(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
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

    case 'blockquote':
      return `\n> ${kids().trim().replace(/\n/g, '\n> ')}\n`;

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
    const prefix = ordered ? `${idx++}. ` : '- ';
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
