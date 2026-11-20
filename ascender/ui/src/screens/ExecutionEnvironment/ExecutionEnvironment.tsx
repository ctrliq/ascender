import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';

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

export interface ExecutionEnvironmentProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function ExecutionEnvironment({ setBreadcrumb }: ExecutionEnvironmentProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchExecutionEnvironments,
    result: { executionEnvironment, formOptions },
  } = useRequest(
    useCallback(async () => {
      // The options are read here rather than in the edit form, so this
      // screen's one loading state covers everything the page needs. Read
      // inside the form, they arrived after the card was already on screen and
      // put a second loading animation inside it.
      const [{ data }, { data: options }] = await Promise.all([
        ExecutionEnvironmentsAPI.readDetail(id),
        ExecutionEnvironmentsAPI.readOptions(),
      ]);
      return { executionEnvironment: data, formOptions: options };
    }, [id]),
    { executionEnvironment: null, formOptions: null }
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
          {t`Back to Execution Environments`}
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
            {(contentError as DetailedError).response?.status === 404 && (
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

  let cardHeader: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  /*
   * One loading animation, in the place the content will be. Drawn inside the
   * card it made the page arrive in pieces: a card and its tabs first, an
   * animation inside them, then the content. Asked with the executionEnvironment rather
   * than on its own, so a later read does not throw away a page already drawn.
   */
  if (isLoading && !executionEnvironment) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {executionEnvironment && formOptions && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={
                <ExecutionEnvironmentEdit
                  executionEnvironment={executionEnvironment}
                  formOptions={formOptions}
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
            {/* A tab this environment has no such thing as, rather than an
                empty card under the tab strip. */}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`/execution_environments/${id}/details`}>
                    {t`View Execution Environment Details`}
                  </Link>
                </ContentError>
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironment;
