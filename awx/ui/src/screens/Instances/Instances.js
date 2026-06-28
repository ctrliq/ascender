import React, { useCallback, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { InstanceList } from './InstanceList';
import Instance from './Instance';
import InstanceAdd from './InstanceAdd';
import InstanceEdit from './InstanceEdit';

function Instances() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/instances': t`Instances`,
    '/instances/add': t`Create new Instance`,
  });

  const buildBreadcrumbConfig = useCallback(
    (instance) => {
      if (!instance) {
        return;
      }
      setBreadcrumbConfig({
        '/instances': t`Instances`,
        '/instances/add': t`Create new Instance`,
        [`/instances/${instance.id}`]: `${instance.hostname}`,
        [`/instances/${instance.id}/details`]: t`Details`,
        [`/instances/${instance.id}/peers`]: t`Peers`,
        [`/instances/${instance.id}/listener_addresses`]: t`Listener Addresses`,
        [`/instances/${instance.id}/edit`]: t`Edit Instance`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="instance" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        <Route
          path="add"
          element={<InstanceAdd setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          path=":id/edit"
          element={<InstanceEdit setBreadcrumb={buildBreadcrumbConfig} />}
        />
        {/* so the nested <Instance> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<Instance setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="instances">
              <InstanceList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default Instances;
