import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
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
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams();
  const userListUrl = `/users`;
  const {
    result: user,
    error: contentError,
    isLoading,
    request: fetchUser,
  } = useRequest(
    useCallback(async () => {
      const { data } = await UsersAPI.readDetail(id);
      return data;
    }, [id]),
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
          {t`Back to Users`}
        </>
      ),
      link: `/users`,
      id: 99,
      persistentFilterKey: 'users',
    },
    { name: t`Details`, link: `/users/${id}/details`, id: 0 },
    {
      name: t`Organizations`,
      link: `/users/${id}/organizations`,
      id: 1,
    },
    { name: t`Teams`, link: `/users/${id}/teams`, id: 2 },
    { name: t`Roles`, link: `/users/${id}/roles`, id: 3 },
  ];

  if (me?.id === Number(id)) {
    tabsArray.push({
      name: t`Tokens`,
      link: `/users/${id}/tokens`,
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
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response && contentError.response.status === 404 && (
              <span>
                {t`User not found.`}{' '}
                <Link to={userListUrl}>{t`View all Users.`}</Link>
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
          {user && <Route path="edit" element={<UserEdit user={user} />} />}
          {user && (
            <Route path="details" element={<UserDetail user={user} />} />
          )}
          {user && (
            <Route
              path="organizations"
              element={<UserOrganizations id={Number(id)} />}
            />
          )}
          {user && <Route path="teams" element={<UserTeams />} />}
          {user && (
            <Route path="roles" element={<UserRolesList user={user} />} />
          )}
          {user && (
            <Route
              path="tokens/*"
              element={
                <UserTokens user={user} setBreadcrumb={setBreadcrumb} />
              }
            />
          )}
          <Route
            path="*"
            element={
              !isLoading ? (
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/users/${id}/details`}>
                      {t`View User Details`}
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

export default User;
