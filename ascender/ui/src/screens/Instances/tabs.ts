import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { UserProfile } from 'contexts/Config';
import getRouteConfig from '../../routeConfig';

export interface InstanceTab {
  label: MessageDescriptor;
  path: string;
}

/**
 * The four faces of the machinery a job runs on: the instances themselves, the
 * groups a job is sent to, the container groups that stand in for them on a
 * cluster, and the mesh drawn as a graph.
 *
 * The rail names this once, as Instances, and these are its tabs: one address
 * each, so a link into any of them still lands where it always did. The labels
 * are descriptors rather than strings, because the list is read at module
 * scope and translated where it is shown.
 */
export const INSTANCE_TABS: InstanceTab[] = [
  { label: msg`Instances`, path: '/instances' },
  { label: msg`Instance Groups`, path: '/instance_groups' },
  { label: msg`Container Groups`, path: '/container_groups' },
  { label: msg`Topology`, path: '/topology' },
];

/**
 * The tabs this user can open. Instances and the topology are for superusers
 * and system auditors, and a tab that leads to a missing route only lands on
 * a not-found page, so the strip asks the route list what this user has
 * rather than keeping a second copy of who may see what.
 */
export function getInstanceTabs(
  userProfile: Partial<UserProfile>
): InstanceTab[] {
  const reachable = new Set(
    getRouteConfig(userProfile).flatMap(({ routes }) =>
      routes.map(({ path }) => path)
    )
  );
  return INSTANCE_TABS.filter(({ path }) => reachable.has(path));
}
