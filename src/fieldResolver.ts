export function yamlString(value: string): string {
  // Collapse newlines/carriage-returns so they cannot break YAML frontmatter
  const collapsed = value.replace(/\r?\n/g, ' ').replace(/\r/g, ' ');
  if (/[:#\[\]{}|>&*!,'"%@`]/.test(collapsed) || collapsed.trim() !== collapsed || collapsed === '') {
    return `"${collapsed.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return collapsed;
}

export function yamlDate(isoString: string): string {
  return (isoString || '').split('T')[0];
}

export function slugify(text: string): string {
  return text
    .replace(/[\\/:*?"<>|]/g, '')  // Windows 파일명 금지 문자 제거
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
