import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Route, useRouteMatch, Switch } from 'react-router-dom';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { Config } from 'contexts/Config';
import UsersList from './UserList/UserList';
import UserAdd from './UserAdd/UserAdd';
import User from './User';

function Users() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/users': i18n._(msg`Users`),
    '/users/add': i18n._(msg`Create New User`),
  });
  const match = useRouteMatch();

  const addUserBreadcrumb = useCallback(
    (user, token) => {
      if (!user) {
        return;
      }

      setBreadcrumbConfig({
        '/users': i18n._(msg`Users`),
        '/users/add': i18n._(msg`Create New User`),
        [`/users/${user.id}`]: `${user.username}`,
        [`/users/${user.id}/edit`]: i18n._(msg`Edit Details`),
        [`/users/${user.id}/details`]: i18n._(msg`Details`),
        [`/users/${user.id}/roles`]: i18n._(msg`Roles`),
        [`/users/${user.id}/teams`]: i18n._(msg`Teams`),
        [`/users/${user.id}/organizations`]: i18n._(msg`Organizations`),
        [`/users/${user.id}/tokens`]: i18n._(msg`Tokens`),
        [`/users/${user.id}/tokens/add`]: i18n._(msg`Create user token`),
        [`/users/${user.id}/tokens/${token && token.id}/details`]: i18n._(
          msg`Details`
        ),
      });
    },
    [i18n]
  );
  return (
    <>
      <ScreenHeader streamType="user" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path={`${match.path}/add`}>
          <UserAdd />
        </Route>
        <Route path={`${match.path}/:id`}>
          <Config>
            {({ me }) => (
              <User setBreadcrumb={addUserBreadcrumb} me={me || {}} />
            )}
          </Config>
        </Route>
        <Route path={`${match.path}`}>
          <PersistentFilters pageKey="users">
            <UsersList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Users as _Users };
export default Users;
