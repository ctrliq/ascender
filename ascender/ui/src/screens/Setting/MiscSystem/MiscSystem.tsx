import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { GroupRedirect, SettingsPage, groupBreadcrumbs } from '../shared';
import MiscSystemDetail from './MiscSystemDetail';
import MiscSystemEdit from './MiscSystemEdit';
import { GROUPS } from './groups';

function MiscSystem() {
  const { t } = useLingui();
  const baseURL = '/system';
  const { me } = useConfig();
  const { pathname } = useLocation();
  // The tabs are groups of this screen's own settings, so the title is the
  // screen's name whichever one is open.
  const breadcrumbConfig = groupBreadcrumbs(
    baseURL,
    GROUPS,
    pathname,
    t`System`,
    t`Edit System`
  );

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <Routes>
            {/* The page is the address the rail names, as it is on every
                other screen, and each group of settings is a tab with an
                address of its own under it: the page opens on the first, and
                the old address still lands. */}
            <Route
              index
              element={<GroupRedirect baseURL={baseURL} groups={GROUPS} />}
            />
            <Route path="details" element={<Navigate to={baseURL} replace />} />
            <Route
              path="edit"
              element={
                <Navigate
                  to={
                    me?.is_superuser
                      ? `${baseURL}/edit/${GROUPS[0]?.id}`
                      : baseURL
                  }
                  replace
                />
              }
            />
            <Route
              path="edit/:group"
              element={
                me?.is_superuser ? (
                  <MiscSystemEdit />
                ) : (
                  <Navigate to={baseURL} replace />
                )
              }
            />
            {/* One address per group, which the tab bar on the page opens:
                named rather than taken as a parameter, so an address naming
                no group of ours is the not found below rather than the first
                group under a wrong name. */}
            {GROUPS.map(({ id }) => (
              <Route key={id} path={id} element={<MiscSystemDetail />} />
            ))}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={baseURL}>{t`View System Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default MiscSystem;
