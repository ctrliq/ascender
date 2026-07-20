import { i18n } from '@lingui/core';

export const locales = {
  en: 'English',
  ar: 'Arabic',
  zh: 'Chinese',
  nl: 'Dutch',
  fr: 'French',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
};

// Locales that are written right-to-left. PatternFly supports RTL when
// dir="rtl" is set on the <html> element.
export const rtlLocales = new Set(['ar']);

/**
 * We do a dynamic import of just the catalog that we need
 * @param locale any locale string
 */
export async function dynamicActivate(locale, pseudolocalization = false) {
  const { messages } = await import(`./locales/${locale}/messages`);

  if (pseudolocalization) {
    Object.keys(messages).forEach((key) => {
      if (Array.isArray(messages[key])) {
        // t`Foo ${param}` -> ["Foo ", ['param']] => [">>", "Foo ", ['param'], "<<"]
        messages[key] = ['»', ...messages[key], '«'];
      } else {
        // simple string
        messages[key] = `»${messages[key]}«`;
      }
    });
  }

  i18n.load(locale, messages);
  i18n.activate(locale);

  // Apply text direction and lang on the root <html> element so that
  // PatternFly and the rest of the UI render right-to-left when needed.
  if (typeof document !== 'undefined' && document.documentElement) {
    const language = locale.split(/[-_]/)[0];
    document.documentElement.lang = language;
    document.documentElement.dir = rtlLocales.has(language) ? 'rtl' : 'ltr';
  }
}
