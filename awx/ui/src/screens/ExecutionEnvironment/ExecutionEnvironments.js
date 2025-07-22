import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Route, Switch } from 'react-router-dom';
import PersistentFilters from 'components/PersistentFilters';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import ExecutionEnvironment from './ExecutionEnvironment';
import ExecutionEnvironmentAdd from './ExecutionEnvironmentAdd';
import ExecutionEnvironmentList from './ExecutionEnvironmentList';

function ExecutionEnvironments() {
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/execution_environments': i18n._(msg`Execution Environments`),
    '/execution_environments/add': i18n._(
      msg`Create new execution environment`
    ),
  });

  const buildBreadcrumbConfig = useCallback(
    (executionEnvironments) => {
      if (!executionEnvironments) {
        return;
      }
      setBreadcrumbConfig({
        '/execution_environments': i18n._(msg`Execution Environments`),
        '/execution_environments/add': i18n._(
          msg`Create new execution environment`
        ),
        [`/execution_environments/${executionEnvironments.id}`]: `${executionEnvironments.name}`,
        [`/execution_environments/${executionEnvironments.id}/edit`]: i18n._(
          msg`Edit details`
        ),
        [`/execution_environments/${executionEnvironments.id}/details`]: i18n._(
          msg`Details`
        ),
      });
    },
    [i18n]
  );
  return (
    <>
      <ScreenHeader
        streamType="execution_environment"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path="/execution_environments/add">
          <ExecutionEnvironmentAdd />
        </Route>
        <Route path="/execution_environments/:id">
          <ExecutionEnvironment setBreadcrumb={buildBreadcrumbConfig} />
        </Route>
        <Route path="/execution_environments">
          <PersistentFilters pageKey="executionEnvironments">
            <ExecutionEnvironmentList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}
export default ExecutionEnvironments;
