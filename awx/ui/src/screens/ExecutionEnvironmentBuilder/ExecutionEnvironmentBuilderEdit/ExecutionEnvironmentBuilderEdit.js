import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import { CardBody } from 'components/Card';
import ExecutionEnvironmentBuilderForm from '../shared/ExecutionEnvironmentBuilderForm';

function ExecutionEnvironmentBuilderEdit({ builder, onUpdate }) {
  const history = useHistory();
  const { t } = useLingui();
  const [formSubmitError, setFormSubmitError] = useState(null);

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      const submitData = {
        ...values,
        credential: values.credential?.id || null,
      };
      const { data: updatedBuilder } =
        await ExecutionEnvironmentBuildersAPI.update(builder.id, submitData);
      if (onUpdate) {
        onUpdate(updatedBuilder);
      }
      history.push(`/execution_environment_builders/${builder.id}`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    history.push(`/execution_environment_builders/${builder.id}`);
  };

  if (!builder) {
    return <div>{t`Loading...`}</div>;
  }

  return (
    <PageSection>
      <Card>
        <CardBody>
          <ExecutionEnvironmentBuilderForm
            executionEnvironmentBuilder={builder}
            onCancel={handleCancel}
            onSubmit={handleSubmit}
            submitError={formSubmitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentBuilderEdit;
