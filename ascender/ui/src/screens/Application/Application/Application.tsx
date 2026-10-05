import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { ApplicationsAPI } from 'api';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import ApplicationEdit from '../ApplicationEdit';
import ApplicationDetails from '../ApplicationDetails';
import ApplicationTokens from '../ApplicationTokens';

export interface ApplicationProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function Application({ setBreadcrumb }: ApplicationProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();
  const {
    isLoading,
    error,
    result: { application, authorizationOptions, clientTypeOptions },
    request: fetchApplication,
  } = useRequest(
    useCallback(async () => {
      const [detail, options] = await Promise.all([
        ApplicationsAPI.readDetail(id),
        ApplicationsAPI.readOptions(),
      ]);
      const authorization = (
        options.data.actions.GET?.authorization_grant_type?.choices ?? []
      ).map(([value, label]) => ({
        value: value ?? '',
        label,
        key: value ?? '',
      }));
      const clientType = (
        options.data.actions.GET?.client_type?.choices ?? []
      ).map(([value, label]) => ({
        value: value ?? '',
        label,
        key: value ?? '',
      }));
      setBreadcrumb(detail.data);

      return {
        application: detail.data,
        authorizationOptions: authorization,
        clientTypeOptions: clientType,
      };
    }, [setBreadcrumb, id]),
    // Loading from the first render: the read starts in an effect, after the
    // routes below have drawn once, and until then an idle hook with no
    // application sent every address to Not Found for a moment.
    {
      application: null,
      authorizationOptions: [],
      clientTypeOptions: [],
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication, pathname]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Applications`}
        </>
      ),
      link: '/applications',
      id: 0,
      persistentFilterKey: 'applications',
    },
    { name: t`Details`, link: `/applications/${id}/details`, id: 1 },
    { name: t`Tokens`, link: `/applications/${id}/tokens`, id: 2 },
  ];

  let cardHeader: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  if (!isLoading && error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {(error as DetailedError).response?.status === 404 && (
              <span>
                {t`Application not found.`}{' '}
                <Link to="/applications">{t`View all Applications.`}</Link>
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
        {cardHeader}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {application && (
            <>
              <Route
                path="edit"
                element={
                  <ApplicationEdit
                    authorizationOptions={authorizationOptions}
                    clientTypeOptions={clientTypeOptions}
                    application={application}
                  />
                }
              />
              <Route
                path="details"
                element={
                  <ApplicationDetails
                    application={application}
                    authorizationOptions={authorizationOptions}
                    clientTypeOptions={clientTypeOptions}
                  />
                }
              />
              {/* An application has no token pages of its own: a row links to
                  the token under its owner, /users/:id/tokens/:tokenId. The
                  /* keeps any deeper address, an old bookmark of a token here
                  for one, on the list rather than on a blank card. */}
              <Route
                path="tokens/*"
                element={<ApplicationTokens application={application} />}
              />
            </>
          )}
          {/* Any other address below the application, a mistyped one for
              instance, says so rather than leaving the card empty. */}
          <Route
            path="*"
            element={
              !isLoading ? (
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/applications/${id}/details`}>
                      {t`View Application Details`}
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
export default Application;
