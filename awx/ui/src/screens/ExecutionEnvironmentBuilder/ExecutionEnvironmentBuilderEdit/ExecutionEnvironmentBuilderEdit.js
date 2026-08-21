import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import { CardBody } from 'components/Card';
import ExecutionEnvironmentBuilderForm from '../shared/ExecutionEnvironmentBuilderForm';

function ExecutionEnvironmentBuilderEdit({ builder, onUpdate }) {
  const navigate = useNavigate();
  const { t } = useLingui();
  const [formSubmitError, setFormSubmitError] = useState(null);

  const handleSubmit = async (values) => {
    setFormSubmitError(null);
    try {
      const submitData = {
        ...values,
        project: values.project?.id || null,
        credential: values.credential?.id || null,
      };
      await ExecutionEnvironmentBuildersAPI.update(builder.id, submitData);
      if (onUpdate) {
        onUpdate();
      }
      navigate(`/execution_environment_builders/${builder.id}`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/execution_environment_builders/${builder.id}`);
  };

  if (!builder) {
    return <div>{t`Loading...`}</div>;
  }

  return (
    <PageSection hasBodyWrapper={false}>
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
