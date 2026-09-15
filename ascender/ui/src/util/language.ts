/**
 * The subset of Navigator this reads, including the two non-standard
 * properties older browsers expose instead of `languages`.
 */
interface NavigatorLanguages {
  languages?: readonly string[];
  language?: string;
  userLanguage?: string;
}

export function getLanguage(nav: NavigatorLanguages): string | undefined {
  if (nav.languages && nav.languages[0]) {
    return nav.languages[0];
  }
  if (nav.language) {
    return nav.language;
  }
  return nav.userLanguage;
}

export function getLanguageWithoutRegionCode(
  nav: NavigatorLanguages
): string | undefined {
  return getLanguage(nav)?.toLowerCase().split(/[_-]+/)[0];
}
