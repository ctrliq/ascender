import React from 'react';
import { Link, Routes, Route, Navigate, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ResourceTabs from 'components/ResourceTabs';
import { useConfig } from 'contexts/Config';
import { SettingsPage } from '../shared';
import { AUTHENTICATION_TABS } from '../Authentication/tabs';
import MappingDetail from './MappingDetail';
import MappingEdit from './MappingEdit';

/**
 * What a provider's answer becomes here: a user, an organization, a team.
 *
 * Its own tab rather than the foot of the session page, where its three maps
 * drew boxes four rows tall among settings that had nothing to do with them.
 */
function Mapping() {
  const baseURL = '/authentication/mapping';
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
    '/authentication/mapping': null,
    '/authentication/mapping/details': t`Authentication`,
    '/authentication/mapping/edit': t`Edit Social Auth Mapping`,
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
            <Route path="details" element={<MappingDetail />} />
            <Route
              path="edit"
              element={
                me?.is_superuser ? (
                  <MappingEdit />
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
                  >{t`View Social Auth Mapping Settings`}</Link>
                </ContentError>
              }
            />
          </Routes>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default Mapping;
