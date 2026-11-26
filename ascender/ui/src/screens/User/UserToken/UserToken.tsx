import type { DetailedError, SetBreadcrumb, User } from 'types/api';
import React, { useEffect, useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { TokensAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import UserTokenDetail from '../UserTokenDetail';

export interface UserTokenProps {
  setBreadcrumb: SetBreadcrumb;
  user: User;
  [key: string]: unknown;
}

function UserToken({ setBreadcrumb, user }: UserTokenProps) {
  const { t } = useLingui();
  const location = useLocation();
  const { id, tokenId } = useParams() as { id: string; tokenId: string };
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
    // Loading from the first render: the read starts in an effect, after the
    // routes below have drawn once, and until then an idle hook with no token
    // sent the details address to Not Found for a moment.
    { token: null, isLoading: true }
  );
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  /*
   * A token's page lives under its owner, but a superuser reaches another
   * user's token from an application's Tokens tab, and Back should return
   * there. The application list says so in the link's state, read once so a
   * click on the Details tab, which drops it, does not lose it. Without it, a
   * reload for one, a token issued through an application that is not the
   * viewer's own can only have been reached from that application.
   */
  const { me } = useConfig();
  const [cameFrom] = useState(() => {
    const backTo = (location.state as { backTo?: unknown } | null)?.backTo;
    return typeof backTo === 'string' && backTo.startsWith('/applications/')
      ? backTo
      : null;
  });
  const tokenApplicationId = token?.summary_fields?.application?.id;
  const isOthersToken =
    token?.summary_fields?.user?.id !== undefined &&
    token.summary_fields.user.id !== me?.id;
  let backLink = `/users/${id}/tokens`;
  if (cameFrom) {
    backLink = cameFrom;
  } else if (tokenApplicationId && isOthersToken) {
    backLink = `/applications/${tokenApplicationId}/tokens`;
  }

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Tokens`}
        </>
      ),
      link: backLink,
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
            {(error as DetailedError).response?.status === 404 && (
              <span>
                {t`Token not found.`}{' '}
                <Link to={`/users/${id}/tokens`}>{t`View all Tokens.`}</Link>
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
            element={<UserTokenDetail token={token} backLink={backLink} />}
          />
        )}
        <Route
          path="*"
          element={
            !isLoading ? (
              <ContentError isNotFound>
                {id && (
                  <Link to={`/users/${id}/tokens`}>{t`View all Tokens.`}</Link>
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
