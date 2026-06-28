import React, { useState, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import PersistentFilters from 'components/PersistentFilters';
import ScreenHeader from 'components/ScreenHeader';
import CredentialTypeAdd from './CredentialTypeAdd';
import CredentialTypeList from './CredentialTypeList';
import CredentialType from './CredentialType';

function CredentialTypes() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/credential_types': t`Credential Types`,
    '/credential_types/add': t`Create new credential type`,
  });

  const buildBreadcrumbConfig = useCallback(
    (credentialTypes) => {
      if (!credentialTypes) {
        return;
      }
      setBreadcrumbConfig({
        '/credential_types': t`Credential Types`,
        '/credential_types/add': t`Create new credential Type`,
        [`/credential_types/${credentialTypes.id}`]: `${credentialTypes.name}`,
        [`/credential_types/${credentialTypes.id}/edit`]: t`Edit details`,
        [`/credential_types/${credentialTypes.id}/details`]: t`Details`,
      });
    },
    [t]
  );
  return (
    <>
      <ScreenHeader
        streamType="credential_type"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<CredentialTypeAdd />} />
        {/* so the nested <CredentialType> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<CredentialType setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="credentialTypes">
              <CredentialTypeList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default CredentialTypes;
