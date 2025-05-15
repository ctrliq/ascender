import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { Route, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import {
  Alert,
  ClipboardCopy,
  ClipboardCopyVariant,
  Modal,
} from '@patternfly/react-core';
import ScreenHeader from 'components/ScreenHeader';
import { Detail, DetailList } from 'components/DetailList';
import PersistentFilters from 'components/PersistentFilters';
import ApplicationsList from './ApplicationsList';
import ApplicationAdd from './ApplicationAdd';
import Application from './Application';

const ApplicationAlert = styled(Alert)`
  margin-bottom: 20px;
`;

function Applications() {
  const { i18n } = useLingui();
  const [applicationModalSource, setApplicationModalSource] = useState(null);
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/applications': i18n._(msg`Applications`),
    '/applications/add': i18n._(msg`Create New Application`),
  });

  const buildBreadcrumbConfig = useCallback((application) => {
    if (!application) {
      return;
    }
    setBreadcrumbConfig({
      '/applications': i18n._(msg`Applications`),
      '/applications/add': i18n._(msg`Create New Application`),
      [`/applications/${application.id}`]: `${application.name}`,
      [`/applications/${application.id}/edit`]: i18n._(msg`Edit Details`),
      [`/applications/${application.id}/details`]: i18n._(msg`Details`),
      [`/applications/${application.id}/tokens`]: i18n._(msg`Tokens`),
    });
  }, [i18n]);

  return (
    <>
      <ScreenHeader
        streamType="o_auth2_application,o_auth2_access_token"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/applications/add">
          <ApplicationAdd
            onSuccessfulAdd={(app) => setApplicationModalSource(app)}
          />
        </Route>
        <Route path="/applications/:id">
          <Application setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/applications">
          <PersistentFilters pageKey="applications">
            <ApplicationsList />
          </PersistentFilters>
        </Route>
      </Switch>
      {applicationModalSource && (
        <Modal
          aria-label={i18n._(msg`Application information`)}
          isOpen
          variant="medium"
          title={i18n._(msg`Application information`)}
          onClose={() => setApplicationModalSource(null)}
        >
          {applicationModalSource.client_secret && (
            <ApplicationAlert
              variant="info"
              isInline
              title={i18n._(msg`This is the only time the client secret will be shown.`)}
            />
          )}
          <DetailList stacked>
            <Detail label={i18n._(msg`Name`)} value={applicationModalSource.name} />
            {applicationModalSource.client_id && (
              <Detail
                label={i18n._(msg`Client ID`)}
                value={
                  <ClipboardCopy
                    isReadOnly
                    variant={ClipboardCopyVariant.expansion}
                  >
                    {applicationModalSource.client_id}
                  </ClipboardCopy>
                }
              />
            )}
            {applicationModalSource.client_secret && (
              <Detail
                label={i18n._(msg`Client secret`)}
                value={
                  <ClipboardCopy
                    isReadOnly
                    variant={ClipboardCopyVariant.expansion}
                  >
                    {applicationModalSource.client_secret}
                  </ClipboardCopy>
                }
              />
            )}
          </DetailList>
        </Modal>
      )}
    </>
  );
}

export default Applications;
