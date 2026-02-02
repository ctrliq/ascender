import React, { useState, useCallback } from 'react';
import { Route, withRouter, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import ExecutionEnvironmentBuildersList from './ExecutionEnvironmentBuilderList/ExecutionEnvironmentBuilderList';
import ExecutionEnvironmentBuilderAdd from './ExecutionEnvironmentBuilderAdd/ExecutionEnvironmentBuilderAdd';
import ExecutionEnvironmentBuilder from './ExecutionEnvironmentBuilder';

function ExecutionEnvironmentBuilders() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/execution_environment_builders': t`Execution Environment Builders`,
    '/execution_environment_builders/add': t`Create New Execution Environment Builder`,
  });

  const buildBreadcrumbConfig = useCallback(
    (builder, nested) => {
      if (!builder) {
        return;
      }
      const builderSchedulesPath = `/execution_environment_builders/${builder.id}/schedules`;
      setBreadcrumbConfig({
        '/execution_environment_builders': t`Execution Environment Builders`,
        '/execution_environment_builders/add': t`Create New Execution Environment Builder`,
        [`/execution_environment_builders/${builder.id}`]: `${builder.name}`,
        [`/execution_environment_builders/${builder.id}/edit`]: t`Edit Details`,
        [`/execution_environment_builders/${builder.id}/details`]: t`Details`,
        [`/execution_environment_builders/${builder.id}/access`]: t`Access`,
        [`${builderSchedulesPath}`]: t`Schedules`,
        [`${builderSchedulesPath}/add`]: t`Create New Schedule`,
        [`${builderSchedulesPath}/${nested?.id}`]: `${nested?.name}`,
        [`${builderSchedulesPath}/${nested?.id}/details`]: t`Schedule Details`,
        [`${builderSchedulesPath}/${nested?.id}/edit`]: t`Edit Details`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader streamType="execution_environment_builder" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/execution_environment_builders/add">
          <ExecutionEnvironmentBuilderAdd />
        </Route>
        <Route path="/execution_environment_builders/:id">
          <ExecutionEnvironmentBuilder setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/execution_environment_builders">
          <PersistentFilters pageKey="execution_environment_builders">
            <ExecutionEnvironmentBuildersList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { ExecutionEnvironmentBuilders as _ExecutionEnvironmentBuilders };
export default withRouter(ExecutionEnvironmentBuilders);
