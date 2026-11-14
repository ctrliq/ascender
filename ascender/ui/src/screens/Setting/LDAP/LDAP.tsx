import React from 'react';
import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import ResourceTabs from 'components/ResourceTabs';
import { SettingsPage } from '../shared';
import LDAPDetail from './LDAPDetail';
import LDAPEdit from './LDAPEdit';

// /authentication/ldap/:category (no sub-view) redirects to that category's details
export interface CategoryRedirectProps {
  baseURL: string;
  [key: string]: unknown;
}

function CategoryRedirect({ baseURL }: CategoryRedirectProps) {
  const { category } = useParams() as { category: string };
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function LDAP() {
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
  const baseURL = '/authentication/ldap';

  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/ldap': null,
    '/authentication/ldap/default': null,
    '/authentication/ldap/default/details': t`LDAP`,
    '/authentication/ldap/default/edit': t`Edit LDAP`,
    '/authentication/ldap/1': null,
    '/authentication/ldap/1/details': t`LDAP`,
    '/authentication/ldap/1/edit': t`Edit LDAP`,
    '/authentication/ldap/2': null,
    '/authentication/ldap/2/details': t`LDAP`,
    '/authentication/ldap/2/edit': t`Edit LDAP`,
    '/authentication/ldap/3': null,
    '/authentication/ldap/3/details': t`LDAP`,
    '/authentication/ldap/3/edit': t`Edit LDAP`,
    '/authentication/ldap/4': null,
    '/authentication/ldap/4/details': t`LDAP`,
    '/authentication/ldap/4/edit': t`Edit LDAP`,
    '/authentication/ldap/5': null,
    '/authentication/ldap/5/details': t`LDAP`,
    '/authentication/ldap/5/edit': t`Edit LDAP`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The LDAP configurations are one object set up more than one
            way, so they are tabs of this page rather than pages of their own
            reached through a list. */}
          <ResourceTabs
            aria-label={t`LDAP tabs`}
            ouiaId="ldap-tabs"
            tabs={[
              { label: t`Default`, path: `${baseURL}/default` },
              { label: t`Server 1`, path: `${baseURL}/1` },
              { label: t`Server 2`, path: `${baseURL}/2` },
              { label: t`Server 3`, path: `${baseURL}/3` },
              { label: t`Server 4`, path: `${baseURL}/4` },
              { label: t`Server 5`, path: `${baseURL}/5` },
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
            <Route path=":category/details" element={<LDAPDetail />} />
            <Route
              path=":category/edit"
              element={onlyForSuperuser(<LDAPEdit />)}
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${baseURL}/default/details`}>
                    {t`View LDAP Settings`}
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

export default LDAP;
