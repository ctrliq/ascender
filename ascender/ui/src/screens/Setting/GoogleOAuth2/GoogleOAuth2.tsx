import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import GoogleOAuth2Detail from './GoogleOAuth2Detail';
import GoogleOAuth2Edit from './GoogleOAuth2Edit';

function GoogleOAuth2() {
  const { t } = useLingui();
  const { me } = useConfig();
  const baseURL = '/authentication/google_oauth2';
  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/google_oauth2': null,
    '/authentication/google_oauth2/details': t`Google OAuth 2.0`,
    '/authentication/google_oauth2/edit': t`Edit Google OAuth 2.0`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <Routes>
            <Route
              index
              element={<Navigate to={`${baseURL}/details`} replace />}
            />
            <Route path="details" element={<GoogleOAuth2Detail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <GoogleOAuth2Edit />
                ) : (
                  <Navigate to={`${baseURL}/details`} replace />
                )
              }
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${baseURL}/details`}>
                    {t`View Google OAuth 2.0 Settings`}
                  </Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default GoogleOAuth2;
