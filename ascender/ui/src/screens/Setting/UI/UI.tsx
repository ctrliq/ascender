import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { GroupRedirect, SettingsPage, groupBreadcrumbs } from '../shared';
import UIDetail from './UIDetail';
import UIEdit from './UIEdit';
import { GROUPS } from './groups';

function UI() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { pathname } = useLocation();
  const baseURL = '/appearance';
  // Only a superuser may change these settings, as on every other settings
  // screen: anyone else who reaches an edit address, by a bookmark or by
  // typing it, lands on the page itself instead.
  const onlyForSuperuser = (element: React.ReactElement) =>
    me?.is_superuser ? element : <Navigate to={baseURL} replace />;

  const breadcrumbConfig = groupBreadcrumbs(
    baseURL,
    GROUPS,
    pathname,
    t`Appearance`,
    t`Edit Appearance`
  );

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <Routes>
            {/* The page is the address the rail names, as it is on every
                other screen, and each group of settings is a tab with an
                address of its own under it, as on Jobs and System. The old
                addresses still land, ?tab= links included. */}
            <Route
              index
              element={<GroupRedirect baseURL={baseURL} groups={GROUPS} />}
            />
            <Route path="details" element={<Navigate to={baseURL} replace />} />
            <Route
              path="edit"
              element={onlyForSuperuser(
                <Navigate to={`${baseURL}/edit/${GROUPS[0]?.id}`} replace />
              )}
            />
            <Route path="edit/:group" element={onlyForSuperuser(<UIEdit />)} />
            {/* One address per group, named rather than taken as a parameter,
                so an address naming no group of ours is the not found below
                rather than the first group under a wrong name. */}
            {GROUPS.map(({ id }) => (
              <Route key={id} path={id} element={<UIDetail />} />
            ))}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={baseURL}>{t`View Appearance Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default UI;
