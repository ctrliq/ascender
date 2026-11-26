import type { UserProfile } from 'contexts/Config';
import React from 'react';

// Each screen is loaded when its route is first visited. Statically imported,
// all twenty-six shipped in the first bundle whether or not anyone opened them.
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

const ActivityStream = React.lazy(() => import('screens/ActivityStream'));
const Applications = React.lazy(() => import('screens/Application'));
const CredentialTypes = React.lazy(() => import('screens/CredentialType'));
const Credentials = React.lazy(() => import('screens/Credential'));
const Dashboard = React.lazy(() => import('screens/Dashboard'));
const ExecutionEnvironments = React.lazy(
  () => import('screens/ExecutionEnvironment')
);
const Hosts = React.lazy(() => import('screens/Host'));
const Instances = React.lazy(() => import('screens/Instances'));
const InstanceGroups = React.lazy(() => import('screens/InstanceGroup'));
const ContainerGroups = React.lazy(
  () => import('screens/InstanceGroup/ContainerGroups')
);
const Inventory = React.lazy(() => import('screens/Inventory'));
const ManagementJobs = React.lazy(() => import('screens/ManagementJob'));
const NotificationTemplates = React.lazy(
  () => import('screens/NotificationTemplate')
);
const Organizations = React.lazy(() => import('screens/Organization'));
const Projects = React.lazy(() => import('screens/Project'));
const Roles = React.lazy(() => import('screens/Roles'));
const Schedules = React.lazy(() => import('screens/Schedule'));
const Appearance = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.Appearance }))
);
const Authentication = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.Authentication }))
);
const AzureAD = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.AzureAD }))
);
const GitHub = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.GitHub }))
);
const GoogleOAuth2 = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.GoogleOAuth2 }))
);
const JobSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.JobSettings }))
);
const LDAP = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.LDAP }))
);
const Logging = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.Logging }))
);
const OIDC = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.OIDC }))
);
const SAML = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.SAML }))
);
const SessionSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.SessionSettings }))
);
const PasswordSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.PasswordSettings }))
);
const TokenSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.TokenSettings }))
);
const MappingSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.MappingSettings }))
);
const SystemSettings = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.SystemSettings }))
);
const Troubleshooting = React.lazy(() =>
  import('screens/Setting').then((m) => ({ default: m.Troubleshooting }))
);
const Teams = React.lazy(() => import('screens/Team'));
const Templates = React.lazy(() => import('screens/Template'));
const TopologyView = React.lazy(() => import('screens/TopologyView'));
const Users = React.lazy(() => import('screens/User'));
const WorkflowApprovals = React.lazy(() => import('screens/WorkflowApproval'));
const Jobs = React.lazy(() =>
  import('screens/Job').then((m) => ({ default: m.Jobs }))
);
const HostMetrics = React.lazy(() => import('screens/HostMetrics'));
const Labels = React.lazy(() => import('screens/Labels'));

/** One screen the navigation leads to, and the route that reaches it. */
export interface AppRoute {
  title: React.ReactNode;
  path: string;
  /**
   * The screen the path renders. A route without one is a link into a screen
   * another route already mounts, which is how the settings pages appear in
   * the rail: they are all sub-routes of the one settings screen.
   */
  screen?: React.ComponentType;
  /**
   * Routed, but left out of the rail, because the rail reaches it through
   * another item: a credential type is a tab of Credentials, the topology a tab
   * of Instances, and the settings screen itself is its own list of pages.
   */
  isHiddenFromNav?: boolean;
  /**
   * The item this route is a tab of, by its path. A hidden route names it so
   * that the rail shows that item as the current one while the tab is open:
   * credential types are a tab of Credentials, and reading one is still being
   * in Credentials as far as the rail is concerned.
   */
  tabOf?: string;
  /**
   * Whether the item carries the count of approvals waiting on this user. The
   * only badge in the rail, and hidden when that count is zero.
   */
  hasApprovalBadge?: boolean;
}

/**
 * One group of the navigation, which is how the sidebar is divided. A group
 * with no title is pinned above the groups as a plain item, which is what the
 * dashboard is.
 */
export interface AppRouteGroup {
  /** The heading over the group, or null for an item pinned above them all. */
  groupTitle: string | null;
  groupId: string;
  routes: AppRoute[];
}

/*
 * The rail, in order. Groups read in the order below and items alphabetically
 * within each, which is the only ordering that stays obvious as items are
 * added. Two levels and no more: where one object has variants, the variants
 * are tabs on its screen rather than items here, so credential types sit with
 * credentials and the topology with the instances it draws.
 */
function getRouteConfig(userProfile: Partial<UserProfile> = {}) {
  let routeConfig: AppRouteGroup[] = [
    {
      groupTitle: null,
      groupId: 'dashboard',
      routes: [
        {
          title: <Trans>Dashboard</Trans>,
          path: '/home',
          screen: Dashboard,
        },
      ],
    },
    {
      groupTitle: t`Operations`,
      groupId: 'operations_group',
      routes: [
        {
          title: <Trans>Approvals</Trans>,
          path: '/approvals',
          screen: WorkflowApprovals,
          hasApprovalBadge: true,
        },
        {
          title: <Trans>Runs</Trans>,
          path: '/runs',
          screen: Jobs,
        },
        {
          title: <Trans>Schedules</Trans>,
          path: '/schedules',
          screen: Schedules,
        },
      ],
    },
    {
      groupTitle: t`Resources`,
      groupId: 'resources_group',
      routes: [
        {
          title: <Trans>Credentials</Trans>,
          path: '/credentials',
          screen: Credentials,
        },
        {
          title: <Trans>Hosts</Trans>,
          path: '/hosts',
          screen: Hosts,
        },
        {
          title: <Trans>Inventories</Trans>,
          path: '/inventories',
          screen: Inventory,
        },
        {
          title: <Trans>Labels</Trans>,
          path: '/labels',
          screen: Labels,
        },
        {
          title: <Trans>Projects</Trans>,
          path: '/projects',
          screen: Projects,
        },
        {
          title: <Trans>Templates</Trans>,
          path: '/templates',
          screen: Templates,
        },
        {
          title: <Trans>Credential Types</Trans>,
          path: '/credential_types',
          screen: CredentialTypes,
          isHiddenFromNav: true,
          tabOf: '/credentials',
        },
      ],
    },
    {
      groupTitle: t`Access`,
      groupId: 'access_group',
      routes: [
        {
          title: <Trans>Organizations</Trans>,
          path: '/organizations',
          screen: Organizations,
        },
        {
          title: <Trans>Roles</Trans>,
          path: '/roles',
          screen: Roles,
        },
        {
          title: <Trans>Teams</Trans>,
          path: '/teams',
          screen: Teams,
        },
        {
          title: <Trans>Users</Trans>,
          path: '/users',
          screen: Users,
        },
      ],
    },
    {
      groupTitle: t`Infrastructure`,
      groupId: 'infrastructure_group',
      routes: [
        {
          title: <Trans>Execution Environments</Trans>,
          path: '/execution_environments',
          screen: ExecutionEnvironments,
        },

        {
          title: <Trans>Instances</Trans>,
          path: '/instances',
          screen: Instances,
        },
        /*
         * The two lists of groups and the mesh drawn as a graph are tabs of
         * the instances screen rather than items of their own: the rail names
         * the machinery once and lights while any of its tabs is open.
         */
        {
          title: <Trans>Instance Groups</Trans>,
          path: '/instance_groups',
          screen: InstanceGroups,
          isHiddenFromNav: true,
          tabOf: '/instances',
        },
        {
          title: <Trans>Container Groups</Trans>,
          path: '/container_groups',
          screen: ContainerGroups,
          isHiddenFromNav: true,
          tabOf: '/instances',
        },
        {
          title: <Trans>Topology</Trans>,
          path: '/topology',
          screen: TopologyView,
          isHiddenFromNav: true,
          tabOf: '/instances',
        },
      ],
    },
    {
      groupTitle: t`Integrations`,
      groupId: 'integrations_group',
      routes: [
        {
          title: <Trans>API Applications</Trans>,
          path: '/applications',
          screen: Applications,
        },
        {
          title: <Trans>Notifications</Trans>,
          path: '/notifications',
          screen: NotificationTemplates,
        },
      ],
    },
    {
      groupTitle: t`Audit`,
      groupId: 'audit_group',
      routes: [
        {
          title: <Trans>Activity Stream</Trans>,
          path: '/activity_stream',
          screen: ActivityStream,
        },
        {
          title: <Trans>Host Metrics</Trans>,
          path: '/host_metrics',
          screen: HostMetrics,
        },
      ],
    },
    {
      groupTitle: t`Settings`,
      groupId: 'settings',
      routes: [
        {
          title: <Trans>Appearance</Trans>,
          path: '/appearance',
          screen: Appearance,
        },
        {
          title: <Trans>Authentication</Trans>,
          path: '/authentication',
          screen: Authentication,
        },
        {
          title: <Trans>Cleanup Jobs</Trans>,
          /* Named as the rail names it. The addresses it had before, as
             management jobs and then data retention, redirect here. */
          path: '/cleanup_jobs',
          screen: ManagementJobs,
        },
        {
          // Not /jobs, which is where a run used to live and still redirects
          // from: an address that used to show a run cannot start showing the
          // settings for one.
          title: <Trans>Jobs</Trans>,
          path: '/job_settings',
          screen: JobSettings,
        },
        {
          title: <Trans>Logging</Trans>,
          path: '/logging',
          screen: Logging,
        },
        {
          title: <Trans>System</Trans>,
          path: '/system',
          screen: SystemSettings,
        },
        {
          title: <Trans>Troubleshooting</Trans>,
          path: '/troubleshooting',
          screen: Troubleshooting,
        },
        /*
         * The sign in methods, which the authentication page lists rather than
         * the rail: each is a screen of its own, mounted at its own address,
         * the same as every page above it.
         */
        ...[
          { path: '/authentication/azure', screen: AzureAD },
          { path: '/authentication/github', screen: GitHub },
          { path: '/authentication/google_oauth2', screen: GoogleOAuth2 },
          { path: '/authentication/ldap', screen: LDAP },
          { path: '/authentication/oidc', screen: OIDC },
          { path: '/authentication/saml', screen: SAML },
          { path: '/authentication/session', screen: SessionSettings },
          { path: '/authentication/password', screen: PasswordSettings },
          { path: '/authentication/tokens', screen: TokenSettings },
          { path: '/authentication/mapping', screen: MappingSettings },
        ].map(({ path, screen }) => ({
          title: <Trans>Authentication</Trans>,
          path,
          screen,
          isHiddenFromNav: true,
        })),
      ],
    },
  ];

  const deleteRoute = (name: string) => {
    routeConfig.forEach((group) => {
      group.routes = group.routes.filter(({ path }) => !path.includes(name));
    });
    routeConfig = routeConfig.filter((groups) => groups.routes.length);
  };

  const deleteRouteGroup = (name: string) => {
    routeConfig = routeConfig.filter(({ groupId }) => !groupId.includes(name));
  };
  if (userProfile?.isSuperUser || userProfile?.isSystemAuditor)
    return routeConfig;
  // By address, so each of these has to be the address the route carries: the
  // rename moved management jobs to cleanup jobs, the topology out of
  // topology_view and the notifications out of notification_templates, and a
  // name left behind here would have stopped hiding its screen.
  deleteRoute('host_metrics');
  deleteRouteGroup('settings');
  deleteRoute('cleanup_jobs');
  deleteRoute('topology');
  deleteRoute('instances');
  // The groups were reached through the Instances item, which is gone now, yet
  // anyone may read the groups they use. Instance Groups takes the place in the
  // rail, and Container Groups stays a tab of it, so neither is left with no
  // way in but a typed address.
  routeConfig.forEach((group) => {
    group.routes = group.routes.map((route) => {
      if (route.path === '/instance_groups') {
        return { ...route, isHiddenFromNav: false, tabOf: undefined };
      }
      if (route.path === '/container_groups') {
        return { ...route, tabOf: '/instance_groups' };
      }
      return route;
    });
  });
  if (userProfile?.isOrgAdmin) return routeConfig;
  if (!userProfile?.isNotificationAdmin) deleteRoute('notifications');

  return routeConfig;
}

export default getRouteConfig;
