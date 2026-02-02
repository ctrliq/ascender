import React, { useEffect, useState, useCallback } from 'react';
import { Route, useRouteMatch, Switch } from 'react-router-dom';
import useRequest from 'hooks/useRequest';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetail';
import ExecutionEnvironmentBuilderEdit from './ExecutionEnvironmentBuilderEdit';

function ExecutionEnvironmentBuilder({ setBreadcrumb }) {
  const match = useRouteMatch();
  const [builder, setBuilder] = useState(null);

  const { request: fetchBuilder, isLoading } = useRequest(
    useCallback(async () => {
      const { data } = await ExecutionEnvironmentBuildersAPI.readDetail(match.params.id);
      setBuilder(data);
      setBreadcrumb(data);
      return data;
    }, [match.params.id, setBreadcrumb])
  );

  useEffect(() => {
    fetchBuilder();
  }, [match.params.id, fetchBuilder]);

  const handleBuilderUpdate = useCallback((updatedBuilder) => {
    setBuilder(updatedBuilder);
    setBreadcrumb(updatedBuilder);
  }, [setBreadcrumb]);

  return (
    <Switch>
      <Route path="/execution_environment_builders/:id/edit">
        <ExecutionEnvironmentBuilderEdit builder={builder} onUpdate={handleBuilderUpdate} />
      </Route>
      <Route path="/execution_environment_builders/:id">
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={isLoading} />
      </Route>
    </Switch>
  );
}

export default ExecutionEnvironmentBuilder;
