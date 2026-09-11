import type { Untyped } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Card, PageSection } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import { ApplicationsAPI } from 'api';
import { CardBody } from 'components/Card';
import ApplicationForm from '../shared/ApplicationForm';

export interface ApplicationAddProps {
  onSuccessfulAdd: (data: Untyped) => void;
  [key: string]: unknown;
}

function ApplicationAdd({ onSuccessfulAdd }: ApplicationAddProps) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    error,
    request: fetchOptions,
    result: { authorizationOptions, clientTypeOptions },
  } = useRequest(
    useCallback(async () => {
      const { data: options } = await ApplicationsAPI.readOptions();
      const authChoices =
        options.actions.GET?.authorization_grant_type?.choices ?? [];
      const clientChoices = options.actions.GET?.client_type?.choices ?? [];

      const authorization = authChoices.map((choice: Untyped) => ({
        value: choice[0],
        label: choice[1],
        key: choice[0],
      }));
      const clientType = clientChoices.map((choice: Untyped) => ({
        value: choice[0],
        label: choice[1],
        key: choice[0],
      }));

      return {
        authorizationOptions: authorization,
        clientTypeOptions: clientType,
      };
    }, []),
    {
      authorizationOptions: [],
      clientTypeOptions: [],
    }
  );
  const handleSubmit = async ({ ...values }) => {
    values.organization = values.organization.id;
    try {
      const { data } = await ApplicationsAPI.create(values);
      onSuccessfulAdd(data);
      navigate(`/applications/${data.id}/details`);
    } catch (err) {
      setSubmitError(err);
    }
  };

  const handleCancel = () => {
    navigate(`/applications`);
  };

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  if (error) {
    return <ContentError error={error} />;
  }
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <ApplicationForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            authorizationOptions={authorizationOptions}
            clientTypeOptions={clientTypeOptions}
            submitError={submitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}
export default ApplicationAdd;
