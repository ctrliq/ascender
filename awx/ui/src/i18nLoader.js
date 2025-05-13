import { i18n } from '@lingui/core';

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

/**
 * We do a dynamic import of just the catalog that we need
 * @param locale any locale string
 */
export async function dynamicActivate(locale, pseudolocalization = false) {
  const { messages } = await import(`./locales/${locale}/messages`);

  if (pseudolocalization) {
    Object.keys(messages).forEach((key) => {
      if (Array.isArray(messages[key])) {
        messages[key] = ['>>', ...messages[key], '<<'];
      } else {
        messages[key] = `>>${messages[key]}<<`;
      }
    });
  }

  i18n.load(locale, messages);
  i18n.activate(locale);
}
