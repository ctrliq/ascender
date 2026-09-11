import type { Project, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { ProjectsAPI } from 'api';
import ProjectForm from '../shared/ProjectForm';

export interface ProjectEditProps {
  project: Project;
  [key: string]: unknown;
}

function ProjectEdit({ project }: ProjectEditProps) {
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();

  const handleSubmit = async ({
    webhook_key,
    webhook_url,
    webhook_credential,
    ...values
  }: Untyped) => {
    if (values.scm_type === 'manual') {
      values.scm_type = '';
    }
    if (!values.credential) {
      // Depending on the permissions of the user submitting the form,
      // the API might throw an unexpected error if our creation request
      // has a zero-length string as its credential field. As a work-around,
      // normalize falsey credential fields by deleting them.
      values.credential = null;
    } else if (typeof values.credential.id === 'number') {
      values.credential = values.credential.id;
    }
    if (!values.signature_validation_credential) {
      values.signature_validation_credential = null;
    } else if (typeof values.signature_validation_credential.id === 'number') {
      values.signature_validation_credential =
        values.signature_validation_credential.id;
    }

    if (webhook_key) {
      values.webhook_key = webhook_key;
    }
    try {
      const {
        data: { id },
      } = await ProjectsAPI.update(project.id, {
        ...values,
        organization: values.organization.id,
        default_environment: values.default_environment?.id || null,
      });
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
          handleCancel={handleCancel}
          handleSubmit={handleSubmit}
          submitError={formSubmitError}
        />
      </CardBody>
    </Card>
  );
}

export default ProjectEdit;
