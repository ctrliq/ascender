import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
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
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<MiscAuthenticationDetail />} />
          <Route
            path="edit"
            element={
              me?.is_superuser ? (
                <MiscAuthenticationEdit />
              ) : (
                <Navigate to={`${baseURL}/details`} replace />
              )
            }
          />
          <Route
            path="*"
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
