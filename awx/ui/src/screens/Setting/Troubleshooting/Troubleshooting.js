import React from 'react';
import { Link } from 'react-router';
import { Routes, Route, Navigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import TroubleshootingDetail from './TroubleshootingDetail';
import TroubleshootingEdit from './TroubleshootingEdit';

function Troubleshooting() {
  const { t } = useLingui();
  const baseURL = '/settings/troubleshooting';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<TroubleshootingDetail />} />
          <Route path="edit" element={<TroubleshootingEdit />} />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>{t`View Troubleshooting settings`}</Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Troubleshooting;
