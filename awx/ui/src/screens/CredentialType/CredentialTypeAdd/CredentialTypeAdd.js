import React, { useState } from 'react';
import { Card, PageSection } from '@patternfly/react-core';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { CredentialTypesAPI } from 'api';
import { parseVariableField } from 'util/yaml';
import CredentialTypeForm from '../shared/CredentialTypeForm';

function CredentialTypeAdd() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState(null);

  const handleSubmit = async (values) => {
    try {
      const { data: response } = await CredentialTypesAPI.create({
        ...values,
        injectors: parseVariableField(values.injectors),
        inputs: parseVariableField(values.inputs),
        kind: 'cloud',
      });
      navigate(`/credential_types/${response.id}/details`);
    } catch (error) {
      setSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/credential_types`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <CredentialTypeForm
            onSubmit={handleSubmit}
            submitError={submitError}
            onCancel={handleCancel}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default CredentialTypeAdd;
