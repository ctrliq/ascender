import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ResourceTabs from 'components/ResourceTabs';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import { AUTHENTICATION_TABS } from '../Authentication/tabs';
import PasswordDetail from './PasswordDetail';
import PasswordEdit from './PasswordEdit';

/**
 * The rules a password for a local account has to meet.
 *
 * Its own tab rather than the foot of the session page: the four of them are
 * one subject, and they sat under three boxes of json that had nothing to do
 * with them.
 */
function Password() {
  const baseURL = '/authentication/password';
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
    '/authentication/password': null,
    '/authentication/password/details': t`Authentication`,
    '/authentication/password/edit': t`Edit Password`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
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
            <Route path="details" element={<PasswordDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <PasswordEdit />
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
                  >{t`View Password Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default Password;
