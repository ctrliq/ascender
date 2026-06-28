import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Routes, Route } from 'react-router';
import PersistentFilters from 'components/PersistentFilters';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import ExecutionEnvironment from './ExecutionEnvironment';
import ExecutionEnvironmentAdd from './ExecutionEnvironmentAdd';
import ExecutionEnvironmentList from './ExecutionEnvironmentList';

function ExecutionEnvironments() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/execution_environments': t`Execution Environments`,
    '/execution_environments/add': t`Create new execution environment`,
  });

  const buildBreadcrumbConfig = useCallback(
    (executionEnvironments) => {
      if (!executionEnvironments) {
        return;
      }
      setBreadcrumbConfig({
        '/execution_environments': t`Execution Environments`,
        '/execution_environments/add': t`Create new execution environment`,
        [`/execution_environments/${executionEnvironments.id}`]: `${executionEnvironments.name}`,
        [`/execution_environments/${executionEnvironments.id}/edit`]: t`Edit details`,
        [`/execution_environments/${executionEnvironments.id}/details`]: t`Details`,
      });
    },
    [t]
  );
  return (
    <>
      <ScreenHeader
        streamType="execution_environment"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        <Route
          path="add"
          element={<ExecutionEnvironmentAdd />}
        />
        {/* so the nested <ExecutionEnvironment> route tree can match the rest */}
        <Route
          path=":id/*"
          element={
            <ExecutionEnvironment setBreadcrumb={buildBreadcrumbConfig} />
          }
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="executionEnvironments">
              <ExecutionEnvironmentList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}
export default ExecutionEnvironments;
