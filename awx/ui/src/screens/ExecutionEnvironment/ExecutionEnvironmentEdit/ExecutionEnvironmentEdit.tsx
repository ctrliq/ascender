import type { ExecutionEnvironment } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { ExecutionEnvironmentsAPI } from 'api';
import { Config } from 'contexts/Config';
import ExecutionEnvironmentForm from '../shared/ExecutionEnvironmentForm';
import type { ExecutionEnvironmentFormValues } from '../shared/ExecutionEnvironmentForm';

export interface ExecutionEnvironmentEditProps {
  executionEnvironment: ExecutionEnvironment;
  [key: string]: unknown;
}

function ExecutionEnvironmentEdit({
  executionEnvironment,
}: ExecutionEnvironmentEditProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const detailsUrl = `/execution_environments/${executionEnvironment.id}/details`;

  const handleSubmit = async (values: ExecutionEnvironmentFormValues) => {
    try {
      await ExecutionEnvironmentsAPI.update(executionEnvironment.id, {
        ...values,
        credential: values.credential?.id ?? null,
        organization: values.organization?.id ?? null,
      });
      navigate(detailsUrl);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(detailsUrl);
  };
  return (
    <CardBody>
      <Config>
        {({ me }) => (
          <ExecutionEnvironmentForm
            executionEnvironment={executionEnvironment}
            onSubmit={handleSubmit}
            submitError={submitError}
            onCancel={handleCancel}
            me={me || {}}
            isOrgLookupDisabled
          />
        )}
      </Config>
    </CardBody>
  );
}

export default ExecutionEnvironmentEdit;
