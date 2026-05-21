import en from './en';
import ko from './ko';
import ja from './ja';
import zh from './zh';

export type Locale = 'en' | 'ko' | 'ja' | 'zh';

const LOCALES: Record<Locale, Record<string, string>> = { en, ko, ja, zh };

let overrideLocale: Locale | null = null;

export function setLocale(locale: Locale | 'auto'): void {
  overrideLocale = locale === 'auto' ? null : locale;
}

function detectLocale(): Locale {
  if (overrideLocale) return overrideLocale;
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
