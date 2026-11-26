import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';

import { useLingui } from '@lingui/react/macro';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import HostList from './HostList';
import HostAdd from './HostAdd';
import Host from './Host';

function Hosts() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/hosts': t`Hosts`,
    '/hosts/add': t`Create New Host`,
  });

  const buildBreadcrumbConfig = useCallback(
    (host?: BreadcrumbResource) => {
      if (!host) {
        return;
      }
      setBreadcrumbConfig({
        '/hosts': t`Hosts`,
        '/hosts/add': t`Create New Host`,
        [`/hosts/${host.id}`]: `${host.name}`,
        [`/hosts/${host.id}/edit`]: t`Edit ${host.name}`,
        [`/hosts/${host.id}/details`]: `${host.name}`,
        [`/hosts/${host.id}/facts`]: `${host.name}`,
        [`/hosts/${host.id}/groups`]: `${host.name}`,
        [`/hosts/${host.id}/runs`]: `${host.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="host" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        <Route path="add" element={<HostAdd />} />
        {/* /* so the nested <Host> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <Config>
              {({ me }) => (
                <Host setBreadcrumb={buildBreadcrumbConfig} me={me || {}} />
              )}
            </Config>
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="hosts">
              <HostList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export { Hosts as _Hosts };
export default Hosts;
