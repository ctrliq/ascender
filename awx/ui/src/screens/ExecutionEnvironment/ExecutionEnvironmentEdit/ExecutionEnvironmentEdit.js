import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { ExecutionEnvironmentsAPI } from 'api';
import { Config } from 'contexts/Config';
import ExecutionEnvironmentForm from '../shared/ExecutionEnvironmentForm';

function ExecutionEnvironmentEdit({ executionEnvironment }) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);
  const detailsUrl = `/execution_environments/${executionEnvironment.id}/details`;

  const handleSubmit = async (values) => {
    try {
      await ExecutionEnvironmentsAPI.update(executionEnvironment.id, {
        ...values,
        credential: values.credential ? values.credential.id : null,
        organization: values.organization ? values.organization.id : null,
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
