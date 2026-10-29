import React from 'react';
import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import ResourceTabs from 'components/ResourceTabs';
import { SettingsPage } from '../shared';
import GitHubDetail from './GitHubDetail';
import GitHubEdit from './GitHubEdit';
import GitHubOrgEdit from './GitHubOrgEdit';
import GitHubTeamEdit from './GitHubTeamEdit';
import GitHubEnterpriseEdit from './GitHubEnterpriseEdit';
import GitHubEnterpriseOrgEdit from './GitHubEnterpriseOrgEdit';
import GitHubEnterpriseTeamEdit from './GitHubEnterpriseTeamEdit';

// /settings/github/:category (no sub-view) redirects to that category's details
export interface CategoryRedirectProps {
  baseURL: string;
  [key: string]: unknown;
}

function CategoryRedirect({ baseURL }: CategoryRedirectProps) {
  const { category } = useParams() as { category: string };
  return <Navigate to={`${baseURL}/${category}/details`} replace />;
}

function GitHub() {
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
  const baseURL = '/authentication/github';

  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
    '/authentication/github': null,
    '/authentication/github/default': null,
    '/authentication/github/default/details': t`GitHub`,
    '/authentication/github/default/edit': t`Edit GitHub`,
    '/authentication/github/organization': null,
    '/authentication/github/organization/details': t`GitHub`,
    '/authentication/github/organization/edit': t`Edit GitHub`,
    '/authentication/github/team': null,
    '/authentication/github/team/details': t`GitHub`,
    '/authentication/github/team/edit': t`Edit GitHub`,
    '/authentication/github/enterprise': null,
    '/authentication/github/enterprise/details': t`GitHub`,
    '/authentication/github/enterprise/edit': t`Edit GitHub`,
    '/authentication/github/enterprise_organization': null,
    '/authentication/github/enterprise_organization/details': t`GitHub`,
    '/authentication/github/enterprise_organization/edit': t`Edit GitHub`,
    '/authentication/github/enterprise_team': null,
    '/authentication/github/enterprise_team/details': t`GitHub`,
    '/authentication/github/enterprise_team/edit': t`Edit GitHub`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The GitHub configurations are one object set up more than one
            way, so they are tabs of this page rather than pages of their own
            reached through a list. */}
          <ResourceTabs
            aria-label={t`GitHub tabs`}
            ouiaId="github-tabs"
            tabs={[
              { label: t`Default`, path: `${baseURL}/default` },
              { label: t`Organization`, path: `${baseURL}/organization` },
              { label: t`Team`, path: `${baseURL}/team` },
              { label: t`Enterprise`, path: `${baseURL}/enterprise` },
              {
                label: t`Enterprise Organization`,
                path: `${baseURL}/enterprise_organization`,
              },
              {
                label: t`Enterprise Team`,
                path: `${baseURL}/enterprise_team`,
              },
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
            <Route path=":category/details" element={<GitHubDetail />} />
            <Route
              path="default/edit"
              element={onlyForSuperuser(<GitHubEdit />)}
            />
            <Route
              path="organization/edit"
              element={onlyForSuperuser(<GitHubOrgEdit />)}
            />
            <Route
              path="team/edit"
              element={onlyForSuperuser(<GitHubTeamEdit />)}
            />
            <Route
              path="enterprise/edit"
              element={onlyForSuperuser(<GitHubEnterpriseEdit />)}
            />
            <Route
              path="enterprise_organization/edit"
              element={onlyForSuperuser(<GitHubEnterpriseOrgEdit />)}
            />
            <Route
              path="enterprise_team/edit"
              element={onlyForSuperuser(<GitHubEnterpriseTeamEdit />)}
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`${baseURL}/default/details`}>
                    {t`View GitHub Settings`}
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

export default GitHub;
