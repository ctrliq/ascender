import React, { useState, useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import HostList from './HostList';
import HostAdd from './HostAdd';
import Host from './Host';

function Hosts() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/hosts': i18n._(msg`Hosts`),
    '/hosts/add': i18n._(msg`Create New Host`),
  });

  const buildBreadcrumbConfig = useCallback((host) => {
    if (!host) {
      return;
    }
    setBreadcrumbConfig({
      '/hosts': i18n._(msg`Hosts`),
      '/hosts/add': i18n._(msg`Create New Host`),
      [`/hosts/${host.id}`]: `${host.name}`,
      [`/hosts/${host.id}/edit`]: i18n._(msg`Edit Details`),
      [`/hosts/${host.id}/details`]: i18n._(msg`Details`),
      [`/hosts/${host.id}/facts`]: i18n._(msg`Facts`),
      [`/hosts/${host.id}/groups`]: i18n._(msg`Groups`),
      [`/hosts/${host.id}/jobs`]: i18n._(msg`Jobs`),
    });
  }, [i18n]);

  return (
    <>
      <ScreenHeader streamType="host" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/hosts/add">
          <HostAdd />
        </Route>
        <Route path="/hosts/:id">
          <Config>
            {({ me }) => (
              <Host setBreadcrumb={buildBreadcrumbConfig} me={me || {}} />
            )}
          </Config>
        </Route>
        <Route path="/hosts">
          <PersistentFilters pageKey="hosts">
            <HostList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Hosts as _Hosts };
export default Hosts;
