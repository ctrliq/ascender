import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import MiscAuthenticationDetail from './MiscAuthenticationDetail';
import MiscAuthenticationEdit from './MiscAuthenticationEdit';

function MiscAuthentication() {
  const baseURL = '/settings/miscellaneous_authentication';
  const { me } = useConfig();
  const { t } = useLingui();
  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<MiscAuthenticationDetail />} />
          <Route
            path={`${baseURL}/edit`}
            element={
              me?.is_superuser ? (
                <MiscAuthenticationEdit />
              ) : (
                <Navigate to={`${baseURL}/details`} replace />
              )
            }
          />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>{t`View Miscellaneous Authentication settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default MiscAuthentication;
