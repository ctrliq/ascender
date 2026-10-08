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
import { ExecutionEnvironmentBuildersAPI } from 'api';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';

import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetails';
import ExecutionEnvironmentBuilderEdit from './ExecutionEnvironmentBuilderEdit';

export interface ExecutionEnvironmentBuilderProps {
  setBreadcrumb: SetBreadcrumb;
}

function ExecutionEnvironmentBuilder({
  setBreadcrumb,
}: ExecutionEnvironmentBuilderProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchBuilder,
    result: builder,
  } = useRequest(
    useCallback(async () => {
      const { data } = await ExecutionEnvironmentBuildersAPI.readDetail(id);
      return data;
    }, [id]),
    null
  );

  useEffect(() => {
    fetchBuilder();
  }, [fetchBuilder, pathname]);

  useEffect(() => {
    if (builder) {
      setBreadcrumb(builder);
    }
  }, [builder, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to execution environment builders`}
        </>
      ),
      link: '/execution_environment_builders',
      id: 99,
      persistentFilterKey: 'executionEnvironmentBuilders',
    },
    {
      name: t`Details`,
      link: `/execution_environment_builders/${id}/details`,
      id: 0,
    },
    {
      name: t`Builds`,
      link: `/execution_environment_builders/${id}/builds`,
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
                {t`Execution environment builder not found.`}{' '}
                <Link to="/execution_environment_builders">
                  {t`View all execution environment builders`}
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

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {isLoading && !builder && <ContentLoading />}
        {builder && String(builder.id) === id && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={
                <ExecutionEnvironmentBuilderEdit
                  executionEnvironmentBuilder={builder}
                />
              }
            />
            <Route
              path="details"
              element={
                <ExecutionEnvironmentBuilderDetails
                  executionEnvironmentBuilder={builder}
                />
              }
            />
            <Route
              path="builds"
              element={
                <JobList
                  defaultParams={{
                    executionenvironmentbuilderbuild__execution_environment_builder:
                      builder.id,
                  }}
                />
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentBuilder;
