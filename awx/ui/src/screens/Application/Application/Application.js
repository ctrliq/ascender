import React, { useCallback, useEffect } from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
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

function Application({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id } = useParams();
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
      const authorization =
        options.data.actions.GET.authorization_grant_type.choices.map(
          (choice) => ({
            value: choice[0],
            label: choice[1],
            key: choice[0],
          })
        );
      const clientType = options.data.actions.GET.client_type.choices.map(
        (choice) => ({
          value: choice[0],
          label: choice[1],
          key: choice[0],
        })
      );
      setBreadcrumb(detail.data);

      return {
        application: detail.data,
        authorizationOptions: authorization,
        clientTypeOptions: clientType,
      };
    }, [setBreadcrumb, id]),
    { authorizationOptions: [], clientTypeOptions: [] }
  );

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication, pathname]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to applications`}
        </>
      ),
      link: '/applications',
      id: 0,
      persistentFilterKey: 'applications',
    },
    { name: t`Details`, link: `/applications/${id}/details`, id: 1 },
    { name: t`Tokens`, link: `/applications/${id}/tokens`, id: 2 },
  ];

  let cardHeader = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  if (!isLoading && error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {error.response?.status === 404 && (
              <span>
                {t`Application not found.`}{' '}
                <Link to="/applications">
                  {t`View all applications.`}
                </Link>
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
          <Route
            index
            element={<Navigate to="details" replace />}
          />
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
              {/* /* so token detail URLs (tokens/:tokenId/details) still
                  resolve to the list, matching the old non-exact v5 route */}
              <Route
                path="tokens/*"
                element={<ApplicationTokens application={application} />}
              />
            </>
          )}
        </Routes>
      </Card>
    </PageSection>
  );
}
export default Application;
