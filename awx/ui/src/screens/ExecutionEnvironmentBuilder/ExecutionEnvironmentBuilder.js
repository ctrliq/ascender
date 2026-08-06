import React, { useEffect, useState, useCallback } from 'react';
import { Route, Routes, useParams } from 'react-router';
import useRequest from 'hooks/useRequest';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetail';
import ExecutionEnvironmentBuilderEdit from './ExecutionEnvironmentBuilderEdit';

function ExecutionEnvironmentBuilder({ setBreadcrumb }) {
  const { id } = useParams();
  const [builder, setBuilder] = useState(null);

  const { request: fetchBuilder, isLoading } = useRequest(
    useCallback(async () => {
      const { data } = await ExecutionEnvironmentBuildersAPI.readDetail(id);
      setBuilder(data);
      setBreadcrumb(data);
      return data;
    }, [id, setBreadcrumb])
  );

  useEffect(() => {
    fetchBuilder();
  }, [id, fetchBuilder]);

  const handleBuilderUpdate = useCallback(() => {
    fetchBuilder();
  }, [fetchBuilder]);

  return (
    <Routes>
      <Route
        path="edit"
        element={
          <ExecutionEnvironmentBuilderEdit
            builder={builder}
            onUpdate={handleBuilderUpdate}
          />
        }
      />
      <Route
        path="*"
        element={
          <ExecutionEnvironmentBuilderDetails
            builder={builder}
            isLoading={isLoading}
          />
        }
      />
    </Routes>
  );
}

export default ExecutionEnvironmentBuilder;
