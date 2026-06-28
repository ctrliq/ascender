import React, { useCallback, useState } from 'react';
import { Routes, Route } from 'react-router';

import { useLingui } from '@lingui/react/macro';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import OrganizationsList from './OrganizationList/OrganizationList';
import OrganizationAdd from './OrganizationAdd/OrganizationAdd';
import Organization from './Organization';

function Organizations() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/organizations': t`Organizations`,
    '/organizations/add': t`Create New Organization`,
  });

  const setBreadcrumb = useCallback(
    (organization) => {
      if (!organization) {
        return;
      }

      const breadcrumb = {
        '/organizations': t`Organizations`,
        '/organizations/add': t`Create New Organization`,
        [`/organizations/${organization.id}`]: `${organization.name}`,
        [`/organizations/${organization.id}/edit`]: t`Edit Details`,
        [`/organizations/${organization.id}/details`]: t`Details`,
        [`/organizations/${organization.id}/access`]: t`Access`,
        [`/organizations/${organization.id}/teams`]: t`Teams`,
        [`/organizations/${organization.id}/notifications`]: t`Notifications`,
        [`/organizations/${organization.id}/execution_environments`]: t`Execution Environments`,
      };
      setBreadcrumbConfig(breadcrumb);
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="organization"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<OrganizationAdd />} />
        {/* so the nested <Organization> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <Config>
              {({ me }) => (
                <Organization setBreadcrumb={setBreadcrumb} me={me || {}} />
              )}
            </Config>
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="organizations">
              <OrganizationsList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export { Organizations as _Organizations };
export default Organizations;
