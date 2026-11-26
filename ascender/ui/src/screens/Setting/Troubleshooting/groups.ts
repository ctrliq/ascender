import { msg } from '@lingui/core/macro';
import type { SettingGroup } from '../shared/settingGroups';

// The shape every settings screen's groups take, named here as well so a tab
// reads its type from the same module as its groups.
export type { SettingGroup };

/**
 * What this screen sets, in the one group its tab offers.
 *
 * The debug category holds three settings that share no subject beyond being
 * the ones nothing else claims, so one group holds them all and the screen
 * draws no tab bar for it. The group still has an address of its own, which
 * gives a second group an obvious place to land the day the platform adds one,
 * and the bar comes back with it.
 */
export const GROUPS: SettingGroup[] = [
  {
    // What a job leaves behind, and what the platform records about itself.
    id: 'misc',
    label: msg`Miscellaneous`,
    keys: [
      'ASCENDER_CLEANUP_PATHS',
      'ASCENDER_REQUEST_PROFILE',
      'RECEPTOR_RELEASE_WORK',
    ],
  },
];
