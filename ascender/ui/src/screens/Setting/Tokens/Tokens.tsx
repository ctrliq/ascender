import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ResourceTabs from 'components/ResourceTabs';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import { AUTHENTICATION_TABS } from '../Authentication/tabs';
import TokensDetail from './TokensDetail';
import TokensEdit from './TokensEdit';

/**
 * How long an OAuth 2 token lasts, and who may ask for one.
 *
 * Its own tab rather than three numbers on the session page: that page was
 * called Session and Token Expiry because of them, and is called Session now.
 */
function Tokens() {
  const baseURL = '/authentication/tokens';
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
    '/authentication/tokens': null,
    '/authentication/tokens/details': t`Authentication`,
    '/authentication/tokens/edit': t`Edit Tokens`,
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
            <Route path="details" element={<TokensDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <TokensEdit />
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
                  >{t`View Tokens Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default Tokens;
