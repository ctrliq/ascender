import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import OIDCDetail from './OIDCDetail';
import OIDCEdit from './OIDCEdit';

function OIDC() {
  const { t } = useLingui();
  const baseURL = '/settings/oidc';
  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<OIDCDetail />} />
          <Route path={`${baseURL}/edit`} element={<OIDCEdit />} />
          <Route
            path={`${baseURL}/*`}
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
