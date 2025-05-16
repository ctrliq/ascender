import React, { useState, useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import Credential from './Credential';
import CredentialAdd from './CredentialAdd';
import { CredentialList } from './CredentialList';

function Credentials() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/credentials': i18n._(msg`Credentials`),
    '/credentials/add': i18n._(msg`Create New Credential`),
  });

  const buildBreadcrumbConfig = useCallback(
    (credential) => {
      if (!credential) {
        return;
      }

      setBreadcrumbConfig({
        '/credentials': i18n._(msg`Credentials`),
        '/credentials/add': i18n._(msg`Create New Credential`),
        [`/credentials/${credential.id}`]: `${credential.name}`,
        [`/credentials/${credential.id}/edit`]: i18n._(msg`Edit Details`),
        [`/credentials/${credential.id}/details`]: i18n._(msg`Details`),
        [`/credentials/${credential.id}/access`]: i18n._(msg`Access`),
        [`/credentials/${credential.id}/job_templates`]: i18n._(msg`Job Templates`),
      });
    },
    [i18n]
  );

  return (
    <>
      <ScreenHeader
        streamType="credential"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/credentials/add">
          <Config>{({ me }) => <CredentialAdd me={me || {}} />}</Config>
        </Route>
        <Route path="/credentials/:id">
          <Credential setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/credentials">
          <PersistentFilters pageKey="credentials">
            <CredentialList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default Credentials;
