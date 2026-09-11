import type { OAuth2Application, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Card } from '@patternfly/react-core';
import { ApplicationsAPI } from 'api';
import { CardBody } from 'components/Card';
import ApplicationForm from '../shared/ApplicationForm';

export interface ApplicationEditProps {
  application: OAuth2Application;
  authorizationOptions: Untyped;
  clientTypeOptions: Untyped;
  [key: string]: unknown;
}

function ApplicationEdit({
  application,
  authorizationOptions,
  clientTypeOptions,
}: ApplicationEditProps) {
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };
  const [submitError, setSubmitError] = useState<unknown>(null);

  const handleSubmit = async ({ ...values }) => {
    values.organization = values.organization.id;
    try {
      await ApplicationsAPI.update(id, values);
      navigate(`/applications/${id}/details`);
    } catch (err) {
      setSubmitError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/applications/${id}/details`);
  };
  return (
    <Card>
      <CardBody>
        <ApplicationForm
          onSubmit={handleSubmit}
          application={application}
          onCancel={handleCancel}
          authorizationOptions={authorizationOptions}
          clientTypeOptions={clientTypeOptions}
          submitError={submitError}
        />
      </CardBody>
    </Card>
  );
}
export default ApplicationEdit;
