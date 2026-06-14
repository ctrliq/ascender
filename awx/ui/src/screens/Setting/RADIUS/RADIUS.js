import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import RADIUSDetail from './RADIUSDetail';
import RADIUSEdit from './RADIUSEdit';

function RADIUS() {
  const { t } = useLingui();
  const baseURL = '/settings/radius';
  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<RADIUSDetail />} />
          <Route path={`${baseURL}/edit`} element={<RADIUSEdit />} />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>
                  {t`View RADIUS settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default RADIUS;
