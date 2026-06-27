
import React, { useState, useEffect } from 'react';

import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { Config } from 'contexts/Config';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { TeamsAPI } from 'api';
import { ResourceAccessList } from 'components/ResourceAccessList';
import { useLingui } from '@lingui/react/macro';
import TeamDetail from './TeamDetail';
import TeamEdit from './TeamEdit';
import TeamRolesList from './TeamRoles';

function Team({ setBreadcrumb }) {
  const { t } = useLingui();
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
          {t`Back to Teams`}
        </>
      ),
      link: `/teams`,
      id: 99,
      persistentFilterKey: 'teams',
    },
    { name: t`Details`, link: `/teams/${id}/details`, id: 0 },
    { name: t`Access`, link: `/teams/${id}/access`, id: 1 },
    { name: t`Roles`, link: `/teams/${id}/roles`, id: 2 },
  ];

  let showCardHeader = true;

  if (location.pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  if (!hasContentLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response.status === 404 && (
              <span>
                {t`Team not found.`}{' '}
                <Link to="/teams">{t`View all Teams.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {team && (
            <Route path="details" element={<TeamDetail team={team} />} />
          )}
          {team && <Route path="edit" element={<TeamEdit team={team} />} />}
          {team && (
            <Route
              path="access"
              element={
                <ResourceAccessList resource={team} apiModel={TeamsAPI} />
              }
            />
          )}
          {team && (
            <Route
              path="roles"
              element={
                <Config>
                  {({ me }) => (
                    <>{me && <TeamRolesList me={me} team={team} />}</>
                  )}
                </Config>
              }
            />
          )}
          <Route
            path="*"
            element={
              !hasContentLoading ? (
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/teams/${id}/details`}>
                      {t`View Team Details`}
                    </Link>
                  )}
                </ContentError>
              ) : null
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Team;
export { Team as _Team };
