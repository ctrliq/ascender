import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ResourceTabs from 'components/ResourceTabs';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import { AUTHENTICATION_TABS } from '../Authentication/tabs';
import MiscAuthenticationDetail from './MiscAuthenticationDetail';
import MiscAuthenticationEdit from './MiscAuthenticationEdit';

function MiscAuthentication() {
  const baseURL = '/authentication/session';
  const { me } = useConfig();
  const { pathname } = useLocation();
  const { t, i18n } = useLingui();
  // A tab is a view of this screen rather than a page of its own, so the
  // screen keeps its name as the title whichever tab is open and the bar says
  // which: the way Jobs and System read. The root names nothing while a tab is
  // open, or the screen would be its own crumb.
  const onTab = pathname === `${baseURL}/details`;
  const breadcrumbConfig = {
    '/authentication': onTab ? null : t`Authentication`,
    '/authentication/session': null,
    '/authentication/session/details': t`Authentication`,
    '/authentication/session/edit': t`Edit Session`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The other half of authentication, which is the sign in methods. */}
          <ResourceTabs
            aria-label={t`Authentication tabs`}
            ouiaId="authentication-tabs"
            tabs={AUTHENTICATION_TABS.map(({ label, path }) => ({
              label: i18n._(label),
              path,
            }))}
          />
          <Routes>
            <Route
              index
              element={<Navigate to={`${baseURL}/details`} replace />}
            />
            <Route path="details" element={<MiscAuthenticationDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <MiscAuthenticationEdit />
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
                  >{t`View Session Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default MiscAuthentication;
