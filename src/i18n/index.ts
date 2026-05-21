import en from './en';
import ko from './ko';
import ja from './ja';
import zh from './zh';

type Locale = 'en' | 'ko' | 'ja' | 'zh';

const LOCALES: Record<Locale, Record<string, string>> = { en, ko, ja, zh };

function detectLocale(): Locale {
  const lang = window.navigator.language.toLowerCase();
  if (lang.startsWith('ko')) return 'ko';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
}

export function t(key: string): string {
  const locale = detectLocale();
  return LOCALES[locale]?.[key] ?? LOCALES.en[key] ?? key;
}
