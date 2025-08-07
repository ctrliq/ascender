import { i18n } from '@lingui/core';
import { en, fr, es, ko, nl, ja, zh, zu } from 'make-plural/plurals';

export const locales = {
  en: 'English',
  ja: 'Japanese',
  zu: 'Zulu',
  fr: 'French',
  es: 'Spanish',
  ko: 'Korean',
  zh: 'Chinese',
  nl: 'Dutch',
};

i18n.loadLocaleData({
  en: { en },
  fr: { fr },
  es: { es },
  ko: { ko },
  nl: { nl },
  ja: { ja },
  zh: { zh },
  zu: { zu },
});

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
}
