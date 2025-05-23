import React, { useCallback, useState } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Route, Switch } from 'react-router-dom';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { InstanceList } from './InstanceList';
import Instance from './Instance';
import InstanceAdd from './InstanceAdd';
import InstanceEdit from './InstanceEdit';

function Instances() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/instances': i18n._(msg`Instances`),
    '/instances/add': i18n._(msg`Create new Instance`),
  });

  const buildBreadcrumbConfig = useCallback((instance) => {
    if (!instance) {
      return;
    }
    setBreadcrumbConfig({
      '/instances': i18n._(msg`Instances`),
      '/instances/add': i18n._(msg`Create new Instance`),
      [`/instances/${instance.id}`]: `${instance.hostname}`,
      [`/instances/${instance.id}/details`]: i18n._(msg`Details`),
      [`/instances/${instance.id}/peers`]: i18n._(msg`Peers`),
      [`/instances/${instance.id}/listener_addresses`]: i18n._(msg`Listener Addresses`),
      [`/instances/${instance.id}/edit`]: i18n._(msg`Edit Instance`),
    });
  }, [i18n]);

  return (
    <>
      <ScreenHeader streamType="instance" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/instances/add">
          <InstanceAdd setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/instances/:id/edit" key="edit">
          <InstanceEdit setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/instances/:id">
          <Instance setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/instances">
          <PersistentFilters pageKey="instances">
            <InstanceList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default Instances;
