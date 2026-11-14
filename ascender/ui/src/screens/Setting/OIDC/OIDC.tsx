import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import OIDCDetail from './OIDCDetail';
import OIDCEdit from './OIDCEdit';

function OIDC() {
  const { t } = useLingui();
  const { me } = useConfig();
  const baseURL = '/authentication/oidc';
  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/oidc': null,
    '/authentication/oidc/details': t`Generic OIDC`,
    '/authentication/oidc/edit': t`Edit Generic OIDC`,
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
            <Route path="details" element={<OIDCDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <OIDCEdit />
                ) : (
                  <Navigate to={`${baseURL}/details`} replace />
                )
              }
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link
                    to={`${baseURL}/details`}
                  >{t`View Generic OIDC Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default OIDC;
