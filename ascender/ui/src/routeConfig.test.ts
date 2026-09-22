import type { AppRouteGroup } from './routeConfig';
import getRouteConfig, { prefetchPopularScreens } from './routeConfig';

vi.mock('util/webWorker', () => ({ default: vi.fn() }));

const userProfile = {
  isSuperUser: false,
  isSystemAuditor: false,
  isOrgAdmin: 0,
  isNotificationAdmin: 0,
  isExecEnvAdmin: 0,
};

const filterPaths = (sidebar: AppRouteGroup[]) => {
  const visibleRoutes: string[] = [];
  sidebar.forEach(({ routes }) => {
    routes.forEach((route) => {
      visibleRoutes.push(route.path);
    });
  });

  return visibleRoutes;
};
describe('getRouteConfig', () => {
  test('routes for system admin', () => {
    const sidebar = getRouteConfig({ ...userProfile, isSuperUser: true });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/host_metrics',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/management_jobs',
      '/instance_groups',
      '/instances',
      '/applications',
      '/execution_environments',
      '/topology_view',
      '/settings',
    ]);
  });

  test('routes for system auditor', () => {
    const sidebar = getRouteConfig({ ...userProfile, isSystemAuditor: true });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/host_metrics',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/management_jobs',
      '/instance_groups',
      '/instances',
      '/applications',
      '/execution_environments',
      '/topology_view',
      '/settings',
    ]);
  });

  test('routes for org admin', () => {
    const sidebar = getRouteConfig({ ...userProfile, isOrgAdmin: 1 });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for notifications admin', () => {
    const sidebar = getRouteConfig({
      ...userProfile,
      isNotificationAdmin: 1,
    });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for execution environments admin', () => {
    const sidebar = getRouteConfig({ ...userProfile, isExecEnvAdmin: 1 });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for regular users', () => {
    const sidebar = getRouteConfig(userProfile);
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for execution environment admins and notification admin', () => {
    const sidebar = getRouteConfig({
      ...userProfile,
      isExecEnvAdmin: 1,
      isNotificationAdmin: 1,
    });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for execution environment admins and organization admins', () => {
    const sidebar = getRouteConfig({
      ...userProfile,
      isExecEnvAdmin: 1,
      isOrgAdmin: 1,
    });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });

  test('routes for notification admins and organization admins', () => {
    const sidebar = getRouteConfig({
      ...userProfile,
      isNotificationAdmin: 1,
      isOrgAdmin: 1,
    });
    const filteredPaths = filterPaths(sidebar);
    expect(filteredPaths).toEqual([
      '/home',
      '/jobs',
      '/schedules',
      '/activity_stream',
      '/workflow_approvals',
      '/labels',
      '/templates',
      '/credentials',
      '/projects',
      '/inventories',
      '/hosts',
      '/organizations',
      '/users',
      '/teams',
      '/credential_types',
      '/notification_templates',
      '/instance_groups',
      '/applications',
      '/execution_environments',
    ]);
  });
});

describe('prefetchPopularScreens', () => {
  const setConnection = (connection: unknown) => {
    Object.defineProperty(navigator, 'connection', {
      value: connection,
      configurable: true,
    });
  };

  afterEach(() => {
    setConnection(undefined);
    vi.unstubAllGlobals();
  });

  test('warms the screens during idle', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);

    prefetchPopularScreens();

    expect(idle).toHaveBeenCalledTimes(1);
    // Without a timeout a busy tab may never reach idle, which is the machine
    // where the click latency is worst.
    expect(idle.mock.calls[0]?.[1]).toEqual({ timeout: 3000 });
  });

  test('falls back to a timer where requestIdleCallback is missing', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const timeout = vi.spyOn(window, 'setTimeout');

    prefetchPopularScreens();

    expect(timeout).toHaveBeenCalled();
    timeout.mockRestore();
  });

  test('stays off when the connection asks to save data', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    setConnection({ saveData: true });

    prefetchPopularScreens();

    expect(idle).not.toHaveBeenCalled();
  });

  test('stays off on a 2g connection', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    setConnection({ effectiveType: 'slow-2g' });

    prefetchPopularScreens();

    expect(idle).not.toHaveBeenCalled();
  });

  test('runs on a fast connection', () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);
    setConnection({ effectiveType: '4g' });

    prefetchPopularScreens();

    expect(idle).toHaveBeenCalledTimes(1);
  });
});
