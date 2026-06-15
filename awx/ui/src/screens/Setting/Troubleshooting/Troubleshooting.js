import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import TroubleshootingDetail from './TroubleshootingDetail';
import TroubleshootingEdit from './TroubleshootingEdit';

function Troubleshooting() {
  const { t } = useLingui();
  const baseURL = '/settings/troubleshooting';
  return (
    <PageSection>
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
