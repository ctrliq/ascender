import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import ExecutionEnvironmentBuilderForm from '../shared/ExecutionEnvironmentBuilderForm';

function ExecutionEnvironmentBuilderAdd() {
  const [formSubmitError, setFormSubmitError] = useState(null);
  const history = useHistory();

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      const submitData = {
        ...values,
        credential: values.credential?.id || null,
      };
      const {
        data: { id },
      } = await ExecutionEnvironmentBuildersAPI.create(submitData);
      history.push(`/execution_environment_builders/${id}`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    history.push('/execution_environment_builders');
  };

  return (
    <PageSection>
      <Card>
        <CardBody>
          <ExecutionEnvironmentBuilderForm
            handleCancel={handleCancel}
            handleSubmit={handleSubmit}
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            submitError={formSubmitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentBuilderAdd;
