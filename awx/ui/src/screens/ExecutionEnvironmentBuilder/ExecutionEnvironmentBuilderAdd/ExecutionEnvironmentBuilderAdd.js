import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import ExecutionEnvironmentBuilderForm from '../shared/ExecutionEnvironmentBuilderForm';

function ExecutionEnvironmentBuilderAdd() {
  const [formSubmitError, setFormSubmitError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      const submitData = {
        ...values,
        project: values.project?.id || null,
        credential: values.credential?.id || null,
      };
      const {
        data: { id },
      } = await ExecutionEnvironmentBuildersAPI.create(submitData);
      navigate(`/execution_environment_builders/${id}`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate('/execution_environment_builders');
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <ExecutionEnvironmentBuilderForm
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
