import React, { useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useLocation, useNavigate } from 'routerCompat';

import { ExecutionEnvironmentsAPI } from 'api';
import { Config } from 'contexts/Config';
import { CardBody } from 'components/Card';
import ExecutionEnvironmentForm from '../shared/ExecutionEnvironmentForm';

function ExecutionEnvironmentAdd() {
  const location = useLocation();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (values) => {
    try {
      const { data: response } = await ExecutionEnvironmentsAPI.create({
        ...values,
        credential: values.credential?.id,
        organization: values.organization?.id,
      });
      navigate(`/execution_environments/${response.id}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/execution_environments`);
  };

  const hubParams = {
    description: '',
    image: '',
    name: '',
  };

  location.search
    .replace(/^\?/, '')
    .split('&')
    .map((s) => s.split('='))
    .forEach(([key, val]) => {
      if (!(key in hubParams)) {
        return;
      }
      hubParams[key] = decodeURIComponent(val);
    });

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <Config>
            {({ me }) => (
              <ExecutionEnvironmentForm
                onSubmit={handleSubmit}
                submitError={submitError}
                onCancel={handleCancel}
                me={me || {}}
                executionEnvironment={hubParams}
              />
            )}
          </Config>
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ExecutionEnvironmentAdd;
