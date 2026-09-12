import type { OAuth2Application } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Card, PageSection } from '@patternfly/react-core';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import { ApplicationsAPI } from 'api';
import { CardBody } from 'components/Card';
import ApplicationForm from '../shared/ApplicationForm';
import type { ApplicationFormValues } from '../shared/ApplicationForm';

export interface ApplicationAddProps {
  /** Hands the new application up so the list can show its client secret. */
  onSuccessfulAdd: (application: OAuth2Application) => void;
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

      const authorization = authChoices.map(([value, label]) => ({
        value: value ?? '',
        label,
        key: value ?? '',
      }));
      const clientType = clientChoices.map(([value, label]) => ({
        value: value ?? '',
        label,
        key: value ?? '',
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
  const handleSubmit = async (values: ApplicationFormValues) => {
    try {
      const { data } = await ApplicationsAPI.create({
        ...values,
        organization: values.organization?.id,
      });
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
