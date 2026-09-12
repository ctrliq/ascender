import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { ProjectsAPI } from 'api';
import ProjectForm from '../shared/ProjectForm';
import type { ProjectFormValues } from '../shared/ProjectForm';

function ProjectAdd() {
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();

  const handleSubmit = async ({
    webhook_key,
    webhook_url,
    webhook_credential,
    ...values
  }: ProjectFormValues) => {
    const payload: Record<string, unknown> = {
      ...values,
      // A manual project has no source control, which the api spells as an
      // empty scm_type rather than as the manual the form offers.
      scm_type: values.scm_type === 'manual' ? '' : values.scm_type,
      // Depending on the permissions of the user submitting the form, the
      // api might throw an unexpected error if our request has a zero-length
      // string as its credential field. As a work-around, normalize falsey
      // credential fields by sending null.
      credential: values.credential?.id ?? null,
      signature_validation_credential:
        values.signature_validation_credential?.id ?? null,
      organization: values.organization?.id,
      default_environment: values.default_environment?.id,
    };
    if (webhook_key) {
      payload.webhook_key = webhook_key;
    }
    setFormSubmitError(null);
    try {
      const {
        data: { id },
      } = await ProjectsAPI.create(payload);
      navigate(`/projects/${id}/details`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/projects`);
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <ProjectForm
            handleCancel={handleCancel}
            handleSubmit={handleSubmit}
            submitError={formSubmitError}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default ProjectAdd;
