import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import {
  Switch,
  Route,
  Redirect,
  Link,
  useRouteMatch,
  useLocation,
} from 'react-router-dom';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import { UsersAPI } from 'api';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import UserDetail from './UserDetail';
import UserEdit from './UserEdit';
import UserOrganizations from './UserOrganizations';
import UserTeams from './UserTeams';
import UserTokens from './UserTokens';
import UserRolesList from './UserRoles/UserRolesList';

function User({ setBreadcrumb, me }) {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch('/users/:id');
  const userListUrl = `/users`;
  const {
    result: user,
    error: contentError,
    isLoading,
    request: fetchUser,
  } = useRequest(
    useCallback(async () => {
      const { data } = await UsersAPI.readDetail(match.params.id);
      return data;
    }, [match.params.id]),
    null
  );

  useEffect(() => {
    fetchUser();
  }, [fetchUser, location.pathname]);

  useEffect(() => {
    if (user) {
      setBreadcrumb(user);
    }
  }, [user, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Users`)}
        </>
      ),
      link: `/users`,
      id: 99,
      persistentFilterKey: 'users',
    },
    { name: i18n._(msg`Details`), link: `${match.url}/details`, id: 0 },
    {
      name: i18n._(msg`Organizations`),
      link: `${match.url}/organizations`,
      id: 1,
    },
    { name: i18n._(msg`Teams`), link: `${match.url}/teams`, id: 2 },
    { name: i18n._(msg`Roles`), link: `${match.url}/roles`, id: 3 },
  ];

  if (me?.id === Number(match.params.id)) {
    tabsArray.push({
      name: i18n._(msg`Tokens`),
      link: `${match.url}/tokens`,
      id: 4,
    });
  }

  let showCardHeader = true;
  if (
    ['edit', 'add', 'tokens/'].some((name) => location.pathname.includes(name))
  ) {
    showCardHeader = false;
  }

  if (!isLoading && contentError) {
    return (
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError.response && contentError.response.status === 404 && (
              <span>
                {i18n._(msg`User not found.`)}{' '}
                <Link to={userListUrl}>{i18n._(msg`View all Users.`)}</Link>
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
          <Redirect from="/users/:id" to="/users/:id/details" exact />
          {user && [
            <Route path="/users/:id/edit" key="edit">
              <UserEdit user={user} />
            </Route>,
            <Route path="/users/:id/details" key="details">
              <UserDetail user={user} />
            </Route>,
            <Route path="/users/:id/organizations" key="organizations">
              <UserOrganizations id={Number(match.params.id)} />
            </Route>,
            <Route path="/users/:id/teams" key="teams">
              <UserTeams />
            </Route>,
            <Route path="/users/:id/roles" key="roles">
              <UserRolesList user={user} />
            </Route>,
            <Route path="/users/:id/tokens" key="tokens">
              <UserTokens
                user={user}
                setBreadcrumb={setBreadcrumb}
                id={Number(match.params.id)}
              />
            </Route>,
          ]}
          <Route key="not-found" path="*">
            {!isLoading && (
              <ContentError isNotFound>
                {match.params.id && (
                  <Link to={`/users/${match.params.id}/details`}>
                    {i18n._(msg`View User Details`)}
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

export default User;
