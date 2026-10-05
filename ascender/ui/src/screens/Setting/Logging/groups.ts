import { msg } from '@lingui/core/macro';
import type { SettingGroup } from '../shared/settingGroups';

// The shape every settings screen's groups take, named here as well so a tab
// reads its type from the same module as its groups.
export type { SettingGroup };

/**
 * What this screen sets, in the two groups its tabs offer.
 *
 * Where the logs go is one decision, taken once and rarely again: the host, the
 * port, the protocol and what it takes to authenticate. What is logged and how
 * it reads is the other, and it is the one anybody comes back to.
 */
export const GROUPS: SettingGroup[] = [
  {
    // Who the aggregator lets in.
    id: 'credentials',
    label: msg`Credentials`,
    keys: ['LOG_AGGREGATOR_USERNAME', 'LOG_AGGREGATOR_PASSWORD'],
  },
  {
    // Whether logs are sent at all, and where they go.
    id: 'general',
    label: msg`General`,
    keys: [
      'LOG_AGGREGATOR_ENABLED',
      'LOG_AGGREGATOR_HOST',
      'LOG_AGGREGATOR_TYPE',
    ],
  },
  {
    // What is sent, and how it reads at the other end.
    id: 'misc',
    label: msg`Miscellaneous`,
    keys: [
      'LOG_AGGREGATOR_TCP_TIMEOUT',
      'LOG_AGGREGATOR_LEVEL',
      'LOG_AGGREGATOR_INDIVIDUAL_FACTS',
      'LOG_AGGREGATOR_LOGGERS',
      'API_400_ERROR_LOG_FORMAT',
    ],
  },
  {
    // How it is carried, and the two settings that only mean anything once it
    // is carried over TCP or HTTPS.
    id: 'protocol',
    label: msg`Protocol`,
    keys: [
      'LOG_AGGREGATOR_PROTOCOL',
      'LOG_AGGREGATOR_PORT',
      'LOG_AGGREGATOR_VERIFY_CERT',
    ],
  },
];
