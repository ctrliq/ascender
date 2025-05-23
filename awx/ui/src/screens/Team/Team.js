/* eslint-disable react/jsx-no-useless-fragment */
import React, { useState, useEffect } from 'react';

import { msg } from '@lingui/macro';
import {
  Link,
  Redirect,
  Route,
  Switch,
  useLocation,
  useParams,
} from 'react-router-dom';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { Config } from 'contexts/Config';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { TeamsAPI } from 'api';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { useLingui } from '@lingui/react';
import TeamDetail from './TeamDetail';
import TeamEdit from './TeamEdit';
import TeamRolesList from './TeamRoles';

function Team({ setBreadcrumb }) {
  const { i18n } = useLingui();
  const [team, setTeam] = useState(null);
  const [contentError, setContentError] = useState(null);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const location = useLocation();
  const { id } = useParams();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await TeamsAPI.readDetail(id);
        setBreadcrumb(data);
        setTeam(data);
      } catch (error) {
        setContentError(error);
      } finally {
        setHasContentLoading(false);
      }
    })();
  }, [id, setBreadcrumb, location]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Teams`)}
        </>
      ),
      link: `/teams`,
      id: 99,
      persistentFilterKey: 'teams',
    },
    { name: i18n._(msg`Details`), link: `/teams/${id}/details`, id: 0 },
    { name: i18n._(msg`Access`), link: `/teams/${id}/access`, id: 1 },
    { name: i18n._(msg`Roles`), link: `/teams/${id}/roles`, id: 2 },
  ];

  let showCardHeader = true;

  if (location.pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  if (!hasContentLoading && contentError) {
    return (
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError.response.status === 404 && (
              <span>
                {i18n._(msg`Team not found.`)}{' '}
                <Link to="/teams">{i18n._(msg`View all Teams.`)}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Switch>
          <Redirect from="/teams/:id" to="/teams/:id/details" exact />
          {team && (
            <Route path="/teams/:id/details">
              <TeamDetail team={team} />
            </Route>
          )}
          {team && (
            <Route path="/teams/:id/edit">
              <TeamEdit team={team} />
            </Route>
          )}
          {team && (
            <Route path="/teams/:id/access">
              <ResourceAccessList resource={team} apiModel={TeamsAPI} />
            </Route>
          )}
          {team && (
            <Route path="/teams/:id/roles">
              <Config>
                {({ me }) => <>{me && <TeamRolesList me={me} team={team} />}</>}
              </Config>
            </Route>
          )}
          <Route key="not-found" path="*">
            {!hasContentLoading && (
              <ContentError isNotFound>
                {id && (
                  <Link to={`/teams/${id}/details`}>
                    {i18n._(msg`View Team Details`)}
                  </Link>
                )}
              </ContentError>
            )}
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default Team;
export { Team as _Team };
