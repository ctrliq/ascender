import type { BreadcrumbResource } from 'types/api';
import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import PersistentFilters from 'components/PersistentFilters';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import ExecutionEnvironmentBuilder from './ExecutionEnvironmentBuilder';
import ExecutionEnvironmentBuilderAdd from './ExecutionEnvironmentBuilderAdd';
import ExecutionEnvironmentBuilderList from './ExecutionEnvironmentBuilderList';

function ExecutionEnvironmentBuilders() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/execution_environment_builders': t`Execution Environment Builders`,
    '/execution_environment_builders/add': t`Create new execution environment builder`,
  });

  const buildBreadcrumbConfig = useCallback(
    (builder?: BreadcrumbResource) => {
      if (!builder) {
        return;
      }
      setBreadcrumbConfig({
        '/execution_environment_builders': t`Execution Environment Builders`,
        '/execution_environment_builders/add': t`Create new execution environment builder`,
        [`/execution_environment_builders/${builder.id}`]: `${builder.name}`,
        [`/execution_environment_builders/${builder.id}/edit`]: t`Edit details`,
        [`/execution_environment_builders/${builder.id}/details`]: t`Details`,
        [`/execution_environment_builders/${builder.id}/builds`]: t`Builds`,
      });
    },
    [t]
  );
  return (
    <>
      <ScreenHeader
        streamType="execution_environment_builder"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route path="add" element={<ExecutionEnvironmentBuilderAdd />} />
        {/* so the nested <ExecutionEnvironmentBuilder> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <ExecutionEnvironmentBuilder
              setBreadcrumb={buildBreadcrumbConfig}
            />
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="executionEnvironmentBuilders">
              <ExecutionEnvironmentBuilderList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default ExecutionEnvironmentBuilders;
