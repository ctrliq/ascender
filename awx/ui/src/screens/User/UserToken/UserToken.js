import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { TokensAPI } from 'api';
import useRequest from 'hooks/useRequest';
import UserTokenDetail from '../UserTokenDetail';

function UserToken({ setBreadcrumb, user }) {
  const { t } = useLingui();
  const location = useLocation();
  const { id, tokenId } = useParams();
  const {
    isLoading,
    error,
    request: fetchToken,
    result: { token },
  } = useRequest(
    useCallback(async () => {
      const response = await TokensAPI.readDetail(tokenId);
      setBreadcrumb(user, response.data);
      return {
        token: response.data,
      };
    }, [setBreadcrumb, user, tokenId]),
    { token: null }
  );
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Tokens`}
        </>
      ),
      link: `/users/${id}/tokens`,
      id: 99,
    },
    {
      name: t`Details`,
      link: `/users/${id}/tokens/${tokenId}/details`,
      id: 0,
    },
  ];

  let showCardHeader = true;

  if (location.pathname.endsWith('edit')) {
    showCardHeader = false;
  }

  if (!isLoading && error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {error.response.status === 404 && (
              <span>
                {t`Token not found.`}{' '}
                <Link to="/users/:id/tokens">
                  {t`View all tokens.`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  return (
    <>
      {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
      <Routes>
        <Route index element={<Navigate to="details" replace />} />
        {token && (
          <Route
            path="details"
            element={<UserTokenDetail token={token} />}
          />
        )}
        <Route
          path="*"
          element={
            !isLoading ? (
              <ContentError isNotFound>
                {id && (
                  <Link to={`/users/${id}/tokens`}>{t`View Tokens`}</Link>
                )}
              </ContentError>
            ) : null
          }
        />
      </Routes>
    </>
  );
}

export default UserToken;
