import type { Project } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { ProjectsAPI } from 'api';
import ProjectForm from '../shared/ProjectForm';
import type { ProjectFormOptions } from '../shared/projectFormOptions';
import type { ProjectFormValues } from '../shared/ProjectForm';

export interface ProjectEditProps {
  project: Project;
  [key: string]: unknown;
  /**
   * What the form draws with, read by the screen above rather than by the
   * form, so the page has one loading state rather than two.
   */
  formOptions: ProjectFormOptions;
}

function ProjectEdit({ project, formOptions }: ProjectEditProps) {
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
      default_environment: values.default_environment?.id || null,
    };
    if (webhook_key) {
      payload.webhook_key = webhook_key;
    }
    try {
      const {
        data: { id },
      } = await ProjectsAPI.update(project.id, payload);
      navigate(`/projects/${id}/details`);
    } catch (error) {
      setFormSubmitError(error);
    }
  };

  const handleCancel = () => {
    navigate(`/projects/${project.id}/details`);
  };

  return (
    <Card>
      <CardBody>
        <ProjectForm
          project={project}
          options={formOptions}
          handleCancel={handleCancel}
          handleSubmit={handleSubmit}
          submitError={formSubmitError}
        />
      </CardBody>
    </Card>
  );
}

export default ProjectEdit;
