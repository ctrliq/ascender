import React, { useState, useCallback } from 'react';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Route, Switch } from 'react-router-dom';
import PersistentFilters from 'components/PersistentFilters';
import ScreenHeader from 'components/ScreenHeader';
import CredentialTypeAdd from './CredentialTypeAdd';
import CredentialTypeList from './CredentialTypeList';
import CredentialType from './CredentialType';

function CredentialTypes() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/credential_types': i18n._(msg`Credential Types`),
    '/credential_types/add': i18n._(msg`Create new credential type`),
  });

  const buildBreadcrumbConfig = useCallback((credentialTypes) => {
    if (!credentialTypes) {
      return;
    }
    setBreadcrumbConfig({
      '/credential_types': i18n._(msg`Credential Types`),
      '/credential_types/add': i18n._(msg`Create new credential Type`),
      [`/credential_types/${credentialTypes.id}`]: `${credentialTypes.name}`,
      [`/credential_types/${credentialTypes.id}/edit`]: i18n._(msg`Edit details`),
      [`/credential_types/${credentialTypes.id}/details`]: i18n._(msg`Details`),
    });
  }, [i18n]);
  return (
    <>
      <ScreenHeader
        streamType="credential_type"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/credential_types/add">
          <CredentialTypeAdd />
        </Route>
        <Route path="/credential_types/:id">
          <CredentialType setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/credential_types">
          <PersistentFilters pageKey="credentialTypes">
            <CredentialTypeList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default CredentialTypes;
