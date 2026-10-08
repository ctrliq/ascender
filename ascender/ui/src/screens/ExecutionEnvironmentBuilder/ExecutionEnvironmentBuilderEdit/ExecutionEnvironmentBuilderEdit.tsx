import type { ExecutionEnvironmentBuilder } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import { Config } from 'contexts/Config';
import ExecutionEnvironmentBuilderForm, {
  toBuilderPayload,
} from '../shared/ExecutionEnvironmentBuilderForm';
import type { ExecutionEnvironmentBuilderFormValues } from '../shared/ExecutionEnvironmentBuilderForm';

export interface ExecutionEnvironmentBuilderEditProps {
  executionEnvironmentBuilder: ExecutionEnvironmentBuilder;
}

function ExecutionEnvironmentBuilderEdit({
  executionEnvironmentBuilder,
}: ExecutionEnvironmentBuilderEditProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const detailsUrl = `/execution_environment_builders/${executionEnvironmentBuilder.id}/details`;

  const handleSubmit = async (
    values: ExecutionEnvironmentBuilderFormValues
  ) => {
    try {
      await ExecutionEnvironmentBuildersAPI.update(
        executionEnvironmentBuilder.id,
        toBuilderPayload(values)
      );
      navigate(detailsUrl);
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <CardBody>
      <Config>
        {({ me }) => (
          <ExecutionEnvironmentBuilderForm
            executionEnvironmentBuilder={executionEnvironmentBuilder}
            onSubmit={handleSubmit}
            submitError={submitError}
            onCancel={() => navigate(detailsUrl)}
            me={me || {}}
          />
        )}
      </Config>
    </CardBody>
  );
}

export default ExecutionEnvironmentBuilderEdit;
