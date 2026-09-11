import type { Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { CredentialTypesAPI } from 'api';
import { parseVariableField } from 'util/yaml';
import CredentialTypeForm from '../shared/CredentialTypeForm';

export interface CredentialTypeEditProps {
  credentialType: Untyped;
  [key: string]: unknown;
}

function CredentialTypeEdit({ credentialType }: CredentialTypeEditProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<Untyped>(null);
  const detailsUrl = `/credential_types/${credentialType.id}/details`;

  const handleSubmit = async (values: Untyped) => {
    try {
      await CredentialTypesAPI.update(credentialType.id, {
        ...values,
        injectors: parseVariableField(values.injectors),
        inputs: parseVariableField(values.inputs),
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
      <CredentialTypeForm
        credentialType={credentialType}
        onSubmit={handleSubmit}
        submitError={submitError}
        onCancel={handleCancel}
      />
    </CardBody>
  );
}

export default CredentialTypeEdit;
