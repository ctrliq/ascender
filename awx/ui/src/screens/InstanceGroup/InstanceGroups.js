import React, { useCallback, useState } from 'react';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Route, Switch, useLocation } from 'react-router-dom';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import InstanceGroupAdd from './InstanceGroupAdd';
import InstanceGroupList from './InstanceGroupList';
import InstanceGroup from './InstanceGroup';
import ContainerGroupAdd from './ContainerGroupAdd';
import ContainerGroup from './ContainerGroup';

function InstanceGroups() {
  const { i18n } = useLingui();
  const { pathname } = useLocation();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/instance_groups': i18n._(t`Instance Groups`),
    '/instance_groups/add': i18n._(t`Create new instance group`),
    '/instance_groups/container_group/add': i18n._(
      t`Create new container group`
    ),
  });

  const buildBreadcrumbConfig = useCallback(
    (instanceGroups, instance) => {
      if (!instanceGroups) {
        return;
      }
      setBreadcrumbConfig({
        '/instance_groups': i18n._(t`Instance Groups`),
        '/instance_groups/add': i18n._(t`Create new instance group`),
        '/instance_groups/container_group/add': i18n._(
          t`Create new container group`
        ),

        [`/instance_groups/${instanceGroups.id}/details`]: i18n._(t`Details`),
        [`/instance_groups/${instanceGroups.id}/instances`]: i18n._(
          t`Instances`
        ),
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}`]: `${instance?.hostname}`,
        [`/instance_groups/${instanceGroups.id}/instances/${instance?.id}/details`]:
          i18n._(t`Instance details`),
        [`/instance_groups/${instanceGroups.id}/jobs`]: i18n._(t`Jobs`),
        [`/instance_groups/${instanceGroups.id}/edit`]: i18n._(
          t`Edit details`
        ),
        [`/instance_groups/${instanceGroups.id}`]: `${instanceGroups.name}`,

        [`/instance_groups/container_group/${instanceGroups.id}/details`]:
          i18n._(t`Details`),
        [`/instance_groups/container_group/${instanceGroups.id}/jobs`]: i18n._(
          t`Jobs`
        ),
        [`/instance_groups/container_group/${instanceGroups.id}/edit`]: i18n._(
          t`Edit details`
        ),
        [`/instance_groups/container_group/${instanceGroups.id}`]: `${instanceGroups.name}`,
      });
    },
    [i18n]
  );

  const streamType = pathname.includes('instances')
    ? 'instance'
    : 'instance_group';

  return (
    <>
      <ScreenHeader
        streamType={streamType}
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/instance_groups/container_group/add">
          <ContainerGroupAdd />
        </Route>
        <Route path="/instance_groups/container_group/:id">
          <ContainerGroup setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/instance_groups/add">
          <InstanceGroupAdd />
        </Route>
        <Route path="/instance_groups/:id">
          <InstanceGroup setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/instance_groups">
          <PersistentFilters pageKey="instanceGroups">
            <InstanceGroupList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default InstanceGroups;
