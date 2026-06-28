import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { Routes, Route } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
	Alert,
	ClipboardCopy,
	ClipboardCopyVariant
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';
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
  const { t } = useLingui();
  const [applicationModalSource, setApplicationModalSource] = useState(null);
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/applications': t`Applications`,
    '/applications/add': t`Create New Application`,
  });

  const buildBreadcrumbConfig = useCallback(
    (application) => {
      if (!application) {
        return;
      }
      setBreadcrumbConfig({
        '/applications': t`Applications`,
        '/applications/add': t`Create New Application`,
        [`/applications/${application.id}`]: `${application.name}`,
        [`/applications/${application.id}/edit`]: t`Edit Details`,
        [`/applications/${application.id}/details`]: t`Details`,
        [`/applications/${application.id}/tokens`]: t`Tokens`,
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
          aria-label={t`Application information`}
          isOpen
          variant="medium"
          title={t`Application information`}
          onClose={() => setApplicationModalSource(null)}
        >
          {applicationModalSource.client_secret && (
            <ApplicationAlert
              variant="info"
              isInline
              title={t`This is the only time the client secret will be shown.`}
            />
          )}
          <DetailList stacked>
            <Detail
              label={t`Name`}
              value={applicationModalSource.name}
            />
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
                label={t`Client secret`}
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
