import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import Credential from './Credential';
import CredentialAdd from './CredentialAdd';
import { CredentialList } from './CredentialList';

function Credentials() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/credentials': t`Credentials`,
    '/credentials/add': t`Create New Credential`,
  });

  const buildBreadcrumbConfig = useCallback(
    (credential) => {
      if (!credential) {
        return;
      }

      setBreadcrumbConfig({
        '/credentials': t`Credentials`,
        '/credentials/add': t`Create New Credential`,
        [`/credentials/${credential.id}`]: `${credential.name}`,
        [`/credentials/${credential.id}/edit`]: t`Edit Details`,
        [`/credentials/${credential.id}/details`]: t`Details`,
        [`/credentials/${credential.id}/access`]: t`Access`,
        [`/credentials/${credential.id}/job_templates`]: t`Job Templates`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="credential"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route
          path="add"
          element={
            <Config>{({ me }) => <CredentialAdd me={me || {}} />}</Config>
          }
        />
        {/* so the nested <Credential> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<Credential setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="credentials">
              <CredentialList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default Credentials;
