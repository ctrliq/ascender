import { msg } from '@lingui/core/macro';
import type { SettingGroup } from '../shared/settingGroups';

// The shape every settings screen's groups take, named here as well so a tab
// reads its type from the same module as its groups.
export type { SettingGroup };

/**
 * What this screen sets, in the five groups its tabs offer.
 *
 * One page of eleven unrelated fields read as a list to scroll rather than
 * something to change: what the login page shows, what the product looks like
 * once you are in, the language it falls back to, the title in the browser tab,
 * and the handful of numbers that are none of those. The detail view shows a
 * group at a time and the edit view edits one, so the two read the same way and
 * a save touches only what was on screen.
 */
export const GROUPS: SettingGroup[] = [
  { id: 'language', label: msg`Language`, keys: ['DEFAULT_UI_LANGUAGE'] },
  {
    id: 'login',
    label: msg`Login`,
    keys: ['CUSTOM_LOGIN_INFO', 'CUSTOM_LOGO'],
  },
  {
    // The mark on the masthead, which a theme neither sets nor changes, so it
    // is neither a theme setting nor one of the loose ends below.
    id: 'logo',
    label: msg`Logo`,
    keys: ['CUSTOM_HEADER_LOGO'],
  },
  {
    // The switch comes last of the three: the form is a grid of equal columns
    // and a switch fills a fraction of one where an input fills it, so at the
    // front it read as a gap in the row rather than the end of it.
    id: 'misc',
    label: msg`Miscellaneous`,
    keys: [
      'MAX_UI_JOB_EVENTS',
      'MAX_UI_EDITOR_ROWS',
      'UI_LIVE_UPDATES_ENABLED',
    ],
  },
  {
    // The default leads: it is the theme everybody gets, and the two below it
    // are how one more comes to exist.
    id: 'theme',
    label: msg`Theme`,
    keys: ['DEFAULT_UI_THEME', 'CUSTOM_THEME_NAME', 'CUSTOM_THEME'],
  },
  { id: 'title', label: msg`Title`, keys: ['CUSTOM_TITLE'] },
];
