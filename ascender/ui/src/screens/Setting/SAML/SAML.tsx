import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import SAMLDetail from './SAMLDetail';
import SAMLEdit from './SAMLEdit';

function SAML() {
  const { t } = useLingui();
  const { me } = useConfig();
  const baseURL = '/authentication/saml';
  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/saml': null,
    '/authentication/saml/details': t`SAML`,
    '/authentication/saml/edit': t`Edit SAML`,
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
            <Route path="details" element={<SAMLDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <SAMLEdit />
                ) : (
                  <Navigate to={`${baseURL}/details`} replace />
                )
              }
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${baseURL}/details`}>{t`View SAML Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default SAML;
