import React from 'react';
import { Link } from 'react-router';
import { Routes, Route, Navigate } from 'routerCompat';
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
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<MiscSystemDetail />} />
          <Route
            path="edit"
            element={
              me?.is_superuser ? (
                <MiscSystemEdit />
              ) : (
                <Navigate to={`${baseURL}/details`} replace />
              )
            }
          />
          <Route
            path="*"
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
