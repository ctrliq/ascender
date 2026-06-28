import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import LoggingDetail from './LoggingDetail';
import LoggingEdit from './LoggingEdit';

function Logging() {
  const baseURL = '/settings/logging';
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
          <Route path="details" element={<LoggingDetail />} />
          <Route
            path="edit"
            element={
              me?.is_superuser ? (
                <LoggingEdit />
              ) : (
                <Navigate to={`${baseURL}/details`} replace />
              )
            }
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>{t`View Logging settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Logging;
