import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import MiscSystemDetail from './MiscSystemDetail';
import MiscSystemEdit from './MiscSystemEdit';

function MiscSystem() {
  const { t } = useLingui();
  const baseURL = '/settings/miscellaneous_system';
  const { me } = useConfig();

  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<MiscSystemDetail />} />
          <Route
            path={`${baseURL}/edit`}
            element={
              me?.is_superuser ? (
                <MiscSystemEdit />
              ) : (
                <Navigate to={`${baseURL}/details`} replace />
              )
            }
          />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>{t`View Miscellaneous System settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default MiscSystem;
