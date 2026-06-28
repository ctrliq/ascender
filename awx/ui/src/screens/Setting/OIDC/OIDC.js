import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import OIDCDetail from './OIDCDetail';
import OIDCEdit from './OIDCEdit';

function OIDC() {
  const { t } = useLingui();
  const baseURL = '/settings/oidc';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<OIDCDetail />} />
          <Route path="edit" element={<OIDCEdit />} />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>
                  {t`View OIDC settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default OIDC;
