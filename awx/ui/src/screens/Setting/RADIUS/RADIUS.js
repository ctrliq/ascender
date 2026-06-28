import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import RADIUSDetail from './RADIUSDetail';
import RADIUSEdit from './RADIUSEdit';

function RADIUS() {
  const { t } = useLingui();
  const baseURL = '/settings/radius';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<RADIUSDetail />} />
          <Route path="edit" element={<RADIUSEdit />} />
          <Route
            path="*"
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
