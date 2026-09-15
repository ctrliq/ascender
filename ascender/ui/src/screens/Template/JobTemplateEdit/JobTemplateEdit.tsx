import type { DetailedError, JobTemplate, SummaryFieldRef } from 'types/api';
/* eslint react/no-unused-state: 0 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router';

import { JobTemplatesAPI, ProjectsAPI } from 'api';
import { getAddedAndRemoved } from 'util/lists';
import useRequest from 'hooks/useRequest';
import ContentLoading from 'components/ContentLoading';
import { CardBody } from 'components/Card';
import JobTemplateForm from '../shared/JobTemplateForm';
import type { JobTemplateFormValues } from '../shared/JobTemplateForm';

export interface JobTemplateEditProps {
  template: JobTemplate;
  /** Re-reads the template after a save, which the detail screen shows. */
  reloadTemplate: () => void;
  [key: string]: unknown;
}

function JobTemplateEdit({ template, reloadTemplate }: JobTemplateEditProps) {
  const navigate = useNavigate();
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const detailsUrl = `/templates/${template.type}/${template.id}/details`;

  const { request: fetchProject, error: fetchProjectError } = useRequest(
    useCallback(async () => {
      await ProjectsAPI.readDetail(template.project as number);
    }, [template.project])
  );

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (fetchProjectError) {
      if ((fetchProjectError as DetailedError).response?.status === 403) {
        setIsDisabled(true);
      }
    }
  }, [fetchProjectError]);

  const handleSubmit = async (values: JobTemplateFormValues) => {
    const {
      labels,
      instanceGroups,
      initialInstanceGroups,
      credentials,
      inventory,
      project,
      webhook_credential,
      webhook_key,
      webhook_url,
      execution_environment,
      ...remainingValues
    } = values;

    setFormSubmitError(null);
    setIsLoading(true);
    remainingValues.project = project?.id;
    remainingValues.webhook_credential = webhook_credential?.id || null;
    if (webhook_key) {
      remainingValues.webhook_key = webhook_key;
    }
    remainingValues.inventory = inventory?.id || null;
    remainingValues.execution_environment = execution_environment?.id || null;
    try {
      await JobTemplatesAPI.update(template.id, remainingValues);
      await Promise.all([
        submitLabels(template?.organization, labels ?? []),
        submitCredentials(credentials ?? []),
        JobTemplatesAPI.orderInstanceGroups(
          template.id,
          (instanceGroups ?? []) as SummaryFieldRef[],
          (initialInstanceGroups ?? []) as SummaryFieldRef[]
        ),
      ]);
      reloadTemplate();
      navigate(detailsUrl);
    } catch (error) {
      setFormSubmitError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitLabels = async (
    orgId?: number | null,
    labels: SummaryFieldRef[] = []
  ) => {
    const { added, removed } = getAddedAndRemoved(
      template.summary_fields.labels?.results ?? [],
      labels
    );

    const disassociationPromises = removed.map((label) =>
      JobTemplatesAPI.disassociateLabel(template.id, label)
    );
    const associationPromises = added.map((label) =>
      JobTemplatesAPI.associateLabel(template.id, label, orgId ?? null)
    );

    const results = await Promise.all([
      ...disassociationPromises,
      ...associationPromises,
    ]);
    return results;
  };

  const submitCredentials = async (newCredentials: SummaryFieldRef[]) => {
    const { added, removed } = getAddedAndRemoved(
      template.summary_fields.credentials,
      newCredentials
    );
    const disassociateCredentials = removed.map((cred) =>
      JobTemplatesAPI.disassociateCredentials(template.id, cred.id)
    );
    const disassociatePromise = await Promise.all(disassociateCredentials);
    const associateCredentials = added.map((cred) =>
      JobTemplatesAPI.associateCredentials(template.id, cred.id)
    );
    const associatePromise = await Promise.all(associateCredentials);
    return Promise.all([disassociatePromise, associatePromise]);
  };

  const handleCancel = () => navigate(detailsUrl);

  const canEdit = template?.summary_fields?.user_capabilities?.edit;

  if (!canEdit) {
    return <Navigate to={detailsUrl} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }

  return (
    <CardBody>
      <JobTemplateForm
        template={template}
        handleCancel={handleCancel}
        handleSubmit={handleSubmit}
        submitError={formSubmitError}
        isOverrideDisabledLookup={!isDisabled}
      />
    </CardBody>
  );
}

export default JobTemplateEdit;
