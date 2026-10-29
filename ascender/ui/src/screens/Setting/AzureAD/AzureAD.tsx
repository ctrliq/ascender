import React from 'react';
import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import ResourceTabs from 'components/ResourceTabs';
import { SettingsPage } from '../shared';
import AzureADDetail from './AzureADDetail';
import AzureADEdit from './AzureADEdit';
import AzureADTenantEdit from './AzureADTenantEdit';

// /settings/azure/:category (no sub-view) redirects to that category's details
export interface CategoryRedirectProps {
  baseURL: string;
  [key: string]: unknown;
}

function CategoryRedirect({ baseURL }: CategoryRedirectProps) {
  const { category } = useParams() as { category: string };
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function AzureAD() {
  const { t } = useLingui();
  const { me } = useConfig();
  // Only a superuser may change these settings, as on every other settings
  // screen: anyone else who reaches an edit address, by a bookmark or by
  // typing it, lands on the details of the same tab instead.
  const onlyForSuperuser = (element: React.ReactElement) =>
    me?.is_superuser ? (
      element
    ) : (
      <Navigate to="../details" relative="path" replace />
    );
  const baseURL = '/authentication/azure';

  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/azure': null,
    '/authentication/azure/default': null,
    '/authentication/azure/default/details': t`Azure AD`,
    '/authentication/azure/default/edit': t`Edit Azure AD`,
    '/authentication/azure/tenant': null,
    '/authentication/azure/tenant/details': t`Azure AD`,
    '/authentication/azure/tenant/edit': t`Edit Azure AD`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The Azure AD configurations are one object set up more than one
            way, so they are tabs of this page rather than pages of their own
            reached through a list. */}
          <ResourceTabs
            aria-label={t`Azure AD tabs`}
            ouiaId="azure-tabs"
            tabs={[
              { label: t`Default`, path: `${baseURL}/default` },
              { label: t`Tenant`, path: `${baseURL}/tenant` },
            ]}
          />
          <Routes>
            <Route
              index
              element={<Navigate to={`${baseURL}/default/details`} replace />}
            />
            <Route
              path=":category"
              element={<CategoryRedirect baseURL={baseURL} />}
            />
            <Route path=":category/details" element={<AzureADDetail />} />
            <Route
              path="default/edit"
              element={onlyForSuperuser(<AzureADEdit />)}
            />
            <Route
              path="tenant/edit"
              element={onlyForSuperuser(<AzureADTenantEdit />)}
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${baseURL}/default/details`}>
                    {t`View Azure AD Settings`}
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

export default AzureAD;
