import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import { Config } from 'contexts/Config';
import UsersList from './UserList/UserList';
import UserAdd from './UserAdd/UserAdd';
import User from './User';

function Users() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/users': t`Users`,
    '/users/add': t`Create New User`,
  });

  const addUserBreadcrumb = useCallback(
    (
      user?: BreadcrumbResource & { username?: string | null },
      token?: BreadcrumbResource & {
        summary_fields?: { application?: { name?: string | null } | null };
      }
    ) => {
      if (!user) {
        return;
      }

      setBreadcrumbConfig({
        '/users': t`Users`,
        '/users/add': t`Create New User`,
        [`/users/${user.id}`]: `${user.username}`,
        [`/users/${user.id}/edit`]: t`Edit ${user.username}`,
        [`/users/${user.id}/details`]: `${user.username}`,
        [`/users/${user.id}/roles`]: `${user.username}`,
        [`/users/${user.id}/teams`]: `${user.username}`,
        [`/users/${user.id}/organizations`]: `${user.username}`,
        [`/users/${user.id}/tokens`]: `${user.username}`,
        [`/users/${user.id}/tokens/add`]: t`Create User Token`,
        /* A token has no name of its own: the list calls it by the
           application it belongs to, or a personal access token. */
        [`/users/${user.id}/tokens/${token && token.id}/details`]:
          token?.summary_fields?.application?.name ?? t`Personal Access Token`,
      });
    },
    [t]
  );
  return (
    <>
      <ScreenHeader streamType="user" breadcrumbConfig={breadcrumbConfig} />
      <Routes>
        <Route path="add" element={<UserAdd />} />
        {/* /* so the nested <User> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <Config>
              {({ me }) => (
                <User setBreadcrumb={addUserBreadcrumb} me={me || {}} />
              )}
            </Config>
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="users">
              <UsersList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export { Users as _Users };
export default Users;
