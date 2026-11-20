import type { BreadcrumbResource, OAuth2Application } from 'types/api';
import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  Alert,
  ClipboardCopy,
  ClipboardCopyVariant,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import ScreenHeader from 'components/ScreenHeader';
import { Detail, DetailList } from 'components/DetailList';
import PersistentFilters from 'components/PersistentFilters';
import ApplicationsList from './ApplicationsList';
import ApplicationAdd from './ApplicationAdd';
import Application from './Application';
import './Applications.css';

function Applications() {
  const { t } = useLingui();
  const [applicationModalSource, setApplicationModalSource] =
    useState<OAuth2Application | null>(null);
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/applications': t`API Applications`,
    '/applications/add': t`Create New Application`,
  });

  const buildBreadcrumbConfig = useCallback(
    (application?: BreadcrumbResource) => {
      if (!application) {
        return;
      }
      setBreadcrumbConfig({
        '/applications': t`API Applications`,
        '/applications/add': t`Create New Application`,
        [`/applications/${application.id}`]: `${application.name}`,
        [`/applications/${application.id}/edit`]: t`Edit ${application.name}`,
        [`/applications/${application.id}/details`]: `${application.name}`,
        [`/applications/${application.id}/tokens`]: `${application.name}`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="o_auth2_application,o_auth2_access_token"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route
          path="add"
          element={
            <ApplicationAdd
              onSuccessfulAdd={(app) => setApplicationModalSource(app)}
            />
          }
        />
        {/* /* so the nested <Application> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<Application setBreadcrumb={buildBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="applications">
              <ApplicationsList />
            </PersistentFilters>
          }
        />
      </Routes>
      {applicationModalSource && (
        <Modal
          aria-label={t`Application Information`}
          isOpen
          variant="medium"
          title={t`Application Information`}
          onClose={() => setApplicationModalSource(null)}
        >
          {applicationModalSource.client_secret && (
            <Alert
              className="ascender-applications__application-alert"
              variant="info"
              isInline
              title={t`This is the only time the client secret will be shown.`}
            />
          )}
          <DetailList stacked>
            <Detail label={t`Name`} value={applicationModalSource.name} />
            {applicationModalSource.client_id && (
              <Detail
                label={t`Client ID`}
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
                label={t`Client Secret`}
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
