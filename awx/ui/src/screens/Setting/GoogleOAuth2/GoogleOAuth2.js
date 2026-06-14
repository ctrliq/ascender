import React from 'react';
import { Link } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import GoogleOAuth2Detail from './GoogleOAuth2Detail';
import GoogleOAuth2Edit from './GoogleOAuth2Edit';

function GoogleOAuth2() {
  const { t } = useLingui();
  const baseURL = '/settings/google_oauth2';
  return (
    <PageSection>
      <Card>
        <Routes>
          <Route
            path={baseURL}
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path={`${baseURL}/details`} element={<GoogleOAuth2Detail />} />
          <Route path={`${baseURL}/edit`} element={<GoogleOAuth2Edit />} />
          <Route
            path={`${baseURL}/*`}
            element={
              <ContentError isNotFound>
                <Link to={`${baseURL}/details`}>
                  {t`View Google OAuth 2.0 settings`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default GoogleOAuth2;
