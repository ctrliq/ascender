import type { UserProfile } from 'contexts/Config';
import React from 'react';

import { Trans } from '@lingui/react/macro';

// The screens most sessions open ship in the first bundle so their first visit
// renders without a fetch and a loading fallback. They also share most of their
// components with each other, so splitting them saved little.
import Credentials from 'screens/Credential';
import Hosts from 'screens/Host';
import Inventory from 'screens/Inventory';
import Projects from 'screens/Project';
import Templates from 'screens/Template';

// Every other screen is loaded when its route is first visited, which keeps
// the rarely opened ones out of the first bundle.

const ActivityStream = React.lazy(() => import('screens/ActivityStream'));
const Applications = React.lazy(() => import('screens/Application'));
const CredentialTypes = React.lazy(() => import('screens/CredentialType'));
const Dashboard = React.lazy(() => import('screens/Dashboard'));
const ExecutionEnvironments = React.lazy(
  () => import('screens/ExecutionEnvironment')
);
const Instances = React.lazy(() => import('screens/Instances'));
const InstanceGroups = React.lazy(() => import('screens/InstanceGroup'));
const ManagementJobs = React.lazy(() => import('screens/ManagementJob'));
const NotificationTemplates = React.lazy(
  () => import('screens/NotificationTemplate')
);
const Organizations = React.lazy(() => import('screens/Organization'));
const Schedules = React.lazy(() => import('screens/Schedule'));
const Settings = React.lazy(() => import('screens/Setting'));
const Teams = React.lazy(() => import('screens/Team'));
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
  screen: React.ComponentType;
}

/** One group of the navigation, which is how the sidebar is divided. */
export interface AppRouteGroup {
  groupTitle: React.ReactNode;
  groupId: string;
  routes: AppRoute[];
}

function getRouteConfig(userProfile: Partial<UserProfile> = {}) {
  let routeConfig: AppRouteGroup[] = [
    {
      groupTitle: <Trans>Views</Trans>,
      groupId: 'views_group',
      routes: [
        {
          title: <Trans>Dashboard</Trans>,
          path: '/home',
          screen: Dashboard,
        },
        {
          title: <Trans>Jobs</Trans>,
          path: '/jobs',
          screen: Jobs,
        },
        {
          title: <Trans>Schedules</Trans>,
          path: '/schedules',
          screen: Schedules,
        },
        {
          title: <Trans>Activity Stream</Trans>,
          path: '/activity_stream',
          screen: ActivityStream,
        },
        {
          title: <Trans>Workflow Approvals</Trans>,
          path: '/workflow_approvals',
          screen: WorkflowApprovals,
        },
        {
          title: <Trans>Host Metrics</Trans>,
          path: '/host_metrics',
          screen: HostMetrics,
        },
      ],
    },
    {
      groupTitle: <Trans>Resources</Trans>,
      groupId: 'resources_group',
      routes: [
        {
          title: <Trans>Labels</Trans>,
          path: '/labels',
          screen: Labels,
        },
        {
          title: <Trans>Templates</Trans>,
          path: '/templates',
          screen: Templates,
        },
        {
          title: <Trans>Credentials</Trans>,
          path: '/credentials',
          screen: Credentials,
        },
        {
          title: <Trans>Projects</Trans>,
          path: '/projects',
          screen: Projects,
        },
        {
          title: <Trans>Inventories</Trans>,
          path: '/inventories',
          screen: Inventory,
        },
        {
          title: <Trans>Hosts</Trans>,
          path: '/hosts',
          screen: Hosts,
        },
      ],
    },
    {
      groupTitle: <Trans>Access</Trans>,
      groupId: 'access_group',
      routes: [
        {
          title: <Trans>Organizations</Trans>,
          path: '/organizations',
          screen: Organizations,
        },
        {
          title: <Trans>Users</Trans>,
          path: '/users',
          screen: Users,
        },
        {
          title: <Trans>Teams</Trans>,
          path: '/teams',
          screen: Teams,
        },
      ],
    },
    {
      groupTitle: <Trans>Administration</Trans>,
      groupId: 'administration_group',
      routes: [
        {
          title: <Trans>Credential Types</Trans>,
          path: '/credential_types',
          screen: CredentialTypes,
        },
        {
          title: <Trans>Notifications</Trans>,
          path: '/notification_templates',
          screen: NotificationTemplates,
        },
        {
          title: <Trans>Management Jobs</Trans>,
          path: '/management_jobs',
          screen: ManagementJobs,
        },
        {
          title: <Trans>Instance Groups</Trans>,
          path: '/instance_groups',
          screen: InstanceGroups,
        },
        {
          title: <Trans>Instances</Trans>,
          path: '/instances',
          screen: Instances,
        },
        {
          title: <Trans>Applications</Trans>,
          path: '/applications',
          screen: Applications,
        },
        {
          title: <Trans>Execution Environments</Trans>,
          path: '/execution_environments',
          screen: ExecutionEnvironments,
        },
        {
          title: <Trans>Topology View</Trans>,
          path: '/topology_view',
          screen: TopologyView,
        },
      ],
    },
    {
      groupTitle: <Trans>Settings</Trans>,
      groupId: 'settings',
      routes: [
        {
          title: <Trans>Settings</Trans>,
          path: '/settings',
          screen: Settings,
        },
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
  if (
    userProfile?.systemConfig?.SUBSCRIPTION_USAGE_MODEL !==
    'unique_managed_hosts'
  ) {
    deleteRoute('host_metrics');
  }
  if (userProfile?.isSuperUser || userProfile?.isSystemAuditor)
    return routeConfig;
  deleteRoute('host_metrics');
  deleteRouteGroup('settings');
  deleteRoute('management_jobs');
  deleteRoute('topology_view');
  deleteRoute('instances');
  if (userProfile?.isOrgAdmin) return routeConfig;
  if (!userProfile?.isNotificationAdmin) deleteRoute('notification_templates');

  return routeConfig;
}

export default getRouteConfig;
