import React, { useEffect, useCallback } from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';

import useRequest from 'hooks/useRequest';
import { ExecutionEnvironmentsAPI } from 'api';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';

import ExecutionEnvironmentDetails from './ExecutionEnvironmentDetails';
import ExecutionEnvironmentEdit from './ExecutionEnvironmentEdit';
import ExecutionEnvironmentTemplateList from './ExecutionEnvironmentTemplate';

function ExecutionEnvironment({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id } = useParams();
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchExecutionEnvironments,
    result: executionEnvironment,
  } = useRequest(
    useCallback(async () => {
      const { data } = await ExecutionEnvironmentsAPI.readDetail(id);
      return data;
    }, [id]),
    null
  );

  useEffect(() => {
    fetchExecutionEnvironments();
  }, [fetchExecutionEnvironments, pathname]);

  useEffect(() => {
    if (executionEnvironment) {
      setBreadcrumb(executionEnvironment);
    }
  }, [executionEnvironment, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to execution environments`}
        </>
      ),
      link: '/execution_environments',
      id: 99,
      persistentFilterKey: 'executionEnvironments',
    },
    {
      name: t`Details`,
      link: `/execution_environments/${id}/details`,
      id: 0,
    },
    {
      name: t`Templates`,
      link: `/execution_environments/${id}/templates`,
      id: 1,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response?.status === 404 && (
              <span>
                {t`Execution environment not found.`}{' '}
                <Link to="/execution_environments">
                  {t`View all execution environments`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let cardHeader = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {isLoading && <ContentLoading />}
        {!isLoading && executionEnvironment && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={
                <ExecutionEnvironmentEdit
                  executionEnvironment={executionEnvironment}
                />
              }
            />
            <Route
              path="details"
              element={
                <ExecutionEnvironmentDetails
                  executionEnvironment={executionEnvironment}
                />
              }
            />
            <Route
              path="templates"
              element={
                <ExecutionEnvironmentTemplateList
                  executionEnvironment={executionEnvironment}
                />
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironment;
