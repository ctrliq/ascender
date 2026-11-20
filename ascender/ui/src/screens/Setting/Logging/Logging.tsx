import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import { GroupRedirect, SettingsPage, groupBreadcrumbs } from '../shared';
import LoggingDetail from './LoggingDetail';
import LoggingEdit from './LoggingEdit';
import { GROUPS } from './groups';

function Logging() {
  const baseURL = '/logging';
  const { me } = useConfig();
  const { t } = useLingui();
  const { pathname } = useLocation();
  const breadcrumbConfig = groupBreadcrumbs(
    baseURL,
    GROUPS,
    pathname,
    t`Logging`,
    t`Edit Logging`
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
                  <LoggingEdit />
                ) : (
                  <Navigate to={baseURL} replace />
                )
              }
            />
            {/* One address per group, named rather than taken as a parameter,
                so an address naming no group of ours is the not found below
                rather than the first group under a wrong name. */}
            {GROUPS.map(({ id }) => (
              <Route key={id} path={id} element={<LoggingDetail />} />
            ))}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={baseURL}>{t`View Logging Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default Logging;
