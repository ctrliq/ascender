import { i18n } from '@lingui/core';
import { messages as englishMessages } from './locales/en/messages';
import getRouteConfig from './routeConfig';

// The group headings are translated as they are read, so the catalogue has to
// be loaded before the config is built.
i18n.load('en', englishMessages);
i18n.activate('en');

/**
 * The rail's shape is the product's own map, so it is asserted whole: the
 * groups in order, the items alphabetical within each, and the two levels the
 * design allows and no more. A change here is a decision, not a detail, which
 * is why this test reads as the picture rather than as a set of rules.
 */
const SUPER_USER = { isSuperUser: true };

/** The items the rail shows for a group, in the order it shows them. */
function itemsOf(groupId: string, profile = SUPER_USER) {
  const group = getRouteConfig(profile).find((g) => g.groupId === groupId);
  return (group?.routes ?? [])
    .filter(({ isHiddenFromNav }) => !isHiddenFromNav)
    .map(({ title }) => {
      // The macro compiles <Trans>Runs</Trans> into an element carrying a
      // hashed id and the source message, which is the label the rail shows.
      const { props } = title as { props: { message?: string } };
      return props.message;
    });
}

describe('routeConfig', () => {
  test('should read as the groups of the redesign, in order', () => {
    expect(
      getRouteConfig(SUPER_USER).map(({ groupTitle }) => groupTitle)
    ).toEqual([
      null,
      'Operations',
      'Resources',
      'Access',
      'Infrastructure',
      'Integrations',
      'Audit',
      'Settings',
    ]);
  });

  test('should pin the dashboard above the groups', () => {
    const [first] = getRouteConfig(SUPER_USER);
    expect(first?.groupTitle).toBeNull();
    expect(first?.routes).toHaveLength(1);
    expect(first?.routes[0]?.path).toBe('/home');
  });

  test('should order every group alphabetically', () => {
    [
      ['operations_group', ['Approvals', 'Runs', 'Schedules']],
      [
        'resources_group',
        [
          'Credentials',
          'Hosts',
          'Inventories',
          'Labels',
          'Projects',
          'Templates',
        ],
      ],
      ['access_group', ['Organizations', 'Roles', 'Teams', 'Users']],
      ['infrastructure_group', ['Execution Environments', 'Instances']],
      ['integrations_group', ['API Applications', 'Notifications']],
      ['audit_group', ['Activity Stream', 'Host Metrics']],
      [
        'settings',
        [
          'Appearance',
          'Authentication',
          'Cleanup Jobs',
          'Jobs',
          'Logging',
          'System',
          'Troubleshooting',
        ],
      ],
    ].forEach(([groupId, expected]) => {
      expect(itemsOf(groupId as string)).toEqual(expected);
      expect(itemsOf(groupId as string)).toEqual(
        [...(expected as string[])].sort((a, b) => a.localeCompare(b))
      );
    });
  });

  /*
   * A variant of an object is a tab on its screen, not an item of its own: the
   * route stays, so a link into it still works and the tab can reach it, but
   * the rail names the object once.
   */
  test('should route the variants without naming them in the rail', () => {
    const hidden = getRouteConfig(SUPER_USER)
      .flatMap(({ routes }) => routes)
      .filter(({ isHiddenFromNav }) => isHiddenFromNav)
      .map(({ path }) => path);

    expect(hidden).toEqual([
      '/credential_types',
      '/instance_groups',
      '/container_groups',
      '/topology',
      '/authentication/azure',
      '/authentication/github',
      '/authentication/google_oauth2',
      '/authentication/ldap',
      '/authentication/oidc',
      '/authentication/saml',
      '/authentication/session',
      '/authentication/password',
      '/authentication/tokens',
      '/authentication/mapping',
    ]);
  });

  /*
   * Every item names a screen, the settings pages included: each is its own
   * address now, and its own screen, rather than a page a settings screen
   * worked out from the address.
   */
  test('should give every item a screen to mount', () => {
    const screenless = getRouteConfig(SUPER_USER)
      .flatMap(({ routes }) => routes)
      .filter(({ screen }) => !screen)
      .map(({ path }) => path);

    expect(screenless).toEqual([]);
  });

  test('should badge the approvals item and nothing else', () => {
    const badged = getRouteConfig(SUPER_USER)
      .flatMap(({ routes }) => routes)
      .filter(({ hasApprovalBadge }) => hasApprovalBadge)
      .map(({ path }) => path);

    expect(badged).toEqual(['/approvals']);
  });

  test('should keep the settings group away from a plain user', () => {
    const groups = getRouteConfig({ isOrgAdmin: 1 }).map(
      ({ groupId }) => groupId
    );
    expect(groups).not.toContain('settings');
  });
});

/**
 * What each kind of account is given, as paths in rail order. The rail is a
 * permission surface as much as a map: an item appearing here for a profile
 * that should not have it is the bug this catches.
 */
describe('getRouteConfig permissions', () => {
  const BASE = {
    isSuperUser: false,
    isSystemAuditor: false,
    isOrgAdmin: 0,
    isNotificationAdmin: 0,
    isExecEnvAdmin: 0,
  };

  const paths = (profile: object) =>
    getRouteConfig({ ...BASE, ...profile }).flatMap(({ routes }) =>
      routes.map(({ path }) => path)
    );

  /** Everything the rail holds, which only an admin and an auditor see. */
  const EVERYTHING = [
    '/home',
    '/approvals',
    '/runs',
    '/schedules',
    '/credentials',
    '/hosts',
    '/inventories',
    '/labels',
    '/projects',
    '/templates',
    '/credential_types',
    '/organizations',
    '/roles',
    '/teams',
    '/users',
    '/execution_environments',
    '/instances',
    '/instance_groups',
    '/container_groups',
    '/topology',
    '/applications',
    '/notifications',
    '/activity_stream',
    '/host_metrics',
    '/appearance',
    '/authentication',
    '/cleanup_jobs',
    '/job_settings',
    '/logging',
    '/system',
    '/troubleshooting',
    '/authentication/azure',
    '/authentication/github',
    '/authentication/google_oauth2',
    '/authentication/ldap',
    '/authentication/oidc',
    '/authentication/saml',
    '/authentication/session',
    '/authentication/password',
    '/authentication/tokens',
    '/authentication/mapping',
  ];

  /**
   * What is left without any administrative right: no settings, no instances,
   * no topology, no host metrics, and no notifications.
   */
  const EVERYBODY = [
    '/home',
    '/approvals',
    '/runs',
    '/schedules',
    '/credentials',
    '/hosts',
    '/inventories',
    '/labels',
    '/projects',
    '/templates',
    '/credential_types',
    '/organizations',
    '/roles',
    '/teams',
    '/users',
    '/execution_environments',
    '/instance_groups',
    '/container_groups',
    '/applications',
    '/activity_stream',
  ];

  /** Notifications is the one item a notification admin adds. */
  const WITH_NOTIFICATIONS = [
    ...EVERYBODY.slice(0, EVERYBODY.indexOf('/applications') + 1),
    '/notifications',
    '/activity_stream',
  ];

  test.each([
    ['system admin', { isSuperUser: true }, EVERYTHING],
    ['system auditor', { isSystemAuditor: true }, EVERYTHING],
    ['org admin', { isOrgAdmin: 1 }, WITH_NOTIFICATIONS],
    ['notification admin', { isNotificationAdmin: 1 }, WITH_NOTIFICATIONS],
    ['execution environment admin', { isExecEnvAdmin: 1 }, EVERYBODY],
    ['regular user', {}, EVERYBODY],
    [
      'execution environment and notification admin',
      { isExecEnvAdmin: 1, isNotificationAdmin: 1 },
      WITH_NOTIFICATIONS,
    ],
    [
      'execution environment admin and org admin',
      { isExecEnvAdmin: 1, isOrgAdmin: 1 },
      WITH_NOTIFICATIONS,
    ],
    [
      'notification admin and org admin',
      { isNotificationAdmin: 1, isOrgAdmin: 1 },
      WITH_NOTIFICATIONS,
    ],
  ])('routes for a %s', (_name, profile, expected) => {
    expect(paths(profile as object)).toEqual(expected);
  });

  /*
   * Without the Instances item the groups would have no way in from the rail,
   * so Instance Groups takes its place and Container Groups becomes its tab.
   */
  test('puts Instance Groups in the rail for a user without Instances', () => {
    expect(itemsOf('infrastructure_group', { ...BASE })).toEqual([
      'Execution Environments',
      'Instance Groups',
    ]);
    const routes = getRouteConfig({ ...BASE }).flatMap((g) => g.routes);
    expect(routes.find(({ path }) => path === '/container_groups')?.tabOf).toBe(
      '/instance_groups'
    );
  });

  test('keeps the groups as tabs of Instances for an admin', () => {
    expect(itemsOf('infrastructure_group')).toEqual([
      'Execution Environments',
      'Instances',
    ]);
  });
});
