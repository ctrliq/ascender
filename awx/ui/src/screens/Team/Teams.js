import React, { useState, useCallback } from 'react';
import { Route, Switch } from 'react-router-dom';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import TeamList from './TeamList';
import TeamAdd from './TeamAdd';
import Team from './Team';

function Teams() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/teams': i18n._(t`Teams`),
    '/teams/add': i18n._(t`Create New Team`),
  });

  const buildBreadcrumbConfig = useCallback(
    (team) => {
      if (!team) {
        return;
      }

      setBreadcrumbConfig({
        '/teams': i18n._(t`Teams`),
        '/teams/add': i18n._(t`Create New Team`),
        [`/teams/${team.id}`]: `${team.name}`,
        [`/teams/${team.id}/edit`]: i18n._(t`Edit Details`),
        [`/teams/${team.id}/details`]: i18n._(t`Details`),
        [`/teams/${team.id}/users`]: i18n._(t`Users`),
        [`/teams/${team.id}/access`]: i18n._(t`Access`),
        [`/teams/${team.id}/roles`]: i18n._(t`Roles`),
      });
    },
    [i18n]
  );

  return (
    <>
      <ScreenHeader streamType="team" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/teams/add">
          <TeamAdd />
        </Route>
        <Route path="/teams/:id">
          <Team setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/teams">
          <PersistentFilters pageKey="teams">
            <Config>
              {({ me }) => <TeamList path="/teams" me={me || {}} />}
            </Config>
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Teams as _Teams };
export default Teams;
