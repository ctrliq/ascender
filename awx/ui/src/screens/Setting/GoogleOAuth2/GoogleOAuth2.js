import React from 'react';
import { Link } from 'react-router';
import { Routes, Route, Navigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import GoogleOAuth2Detail from './GoogleOAuth2Detail';
import GoogleOAuth2Edit from './GoogleOAuth2Edit';

function GoogleOAuth2() {
  const { t } = useLingui();
  const baseURL = '/settings/google_oauth2';
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <Routes>
          <Route
            index
            element={<Navigate to={`${baseURL}/details`} replace />}
          />
          <Route path="details" element={<GoogleOAuth2Detail />} />
          <Route path="edit" element={<GoogleOAuth2Edit />} />
          <Route
            path="*"
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
