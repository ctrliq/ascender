import React, { useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useNavigate } from 'react-router';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { Config } from 'contexts/Config';
import { CardBody } from 'components/Card';
import ExecutionEnvironmentBuilderForm, {
  toBuilderPayload,
} from '../shared/ExecutionEnvironmentBuilderForm';
import type { ExecutionEnvironmentBuilderFormValues } from '../shared/ExecutionEnvironmentBuilderForm';

function ExecutionEnvironmentBuilderAdd() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const handleSubmit = async (
    values: ExecutionEnvironmentBuilderFormValues
  ) => {
    try {
      const { data: response } = await ExecutionEnvironmentBuildersAPI.create(
        toBuilderPayload(values)
      );
      navigate(`/execution_environment_builders/${response.id}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/execution_environment_builders`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <Config>
            {({ me }) => (
              <ExecutionEnvironmentBuilderForm
                onSubmit={handleSubmit}
                submitError={submitError}
                onCancel={handleCancel}
                me={me || {}}
              />
            )}
          </Config>
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentBuilderAdd;
