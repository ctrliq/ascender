import type { SummaryFieldRef } from 'types/api';
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card, PageSection } from '@patternfly/react-core';
import { CardBody } from 'components/Card';
import { WorkflowJobTemplatesAPI, OrganizationsAPI, UsersAPI } from 'api';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import WorkflowJobTemplateForm from '../shared/WorkflowJobTemplateForm';
import type { WorkflowJobTemplateFormValues } from '../shared/WorkflowJobTemplateForm';

function WorkflowJobTemplateAdd() {
  const { me = {} } = useConfig();
  const navigate = useNavigate();
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);

  const handleSubmit = async (values: WorkflowJobTemplateFormValues) => {
    const {
      labels,
      inventory,
      organization,
      webhook_credential,
      webhook_key,
      limit,
      job_tags,
      skip_tags,
      scm_branch,
      ...templatePayload
    } = values;
    const payload: Record<string, unknown> = { ...templatePayload };
    payload.inventory = inventory?.id;
    payload.organization = organization?.id;
    payload.webhook_credential = webhook_credential?.id;
    if (webhook_key) {
      payload.webhook_key = webhook_key;
    }
    payload.limit = limit === '' ? null : limit;
    payload.job_tags = job_tags === '' ? null : job_tags;
    payload.skip_tags = skip_tags === '' ? null : skip_tags;
    payload.scm_branch = scm_branch === '' ? null : scm_branch;
    const organizationId =
      organization?.id ||
      (inventory?.summary_fields as { organization?: { id?: number } })
        ?.organization?.id;
    try {
      const {
        data: { id },
      } = await WorkflowJobTemplatesAPI.create(payload);
      await Promise.all(await submitLabels(id, organizationId, labels));
      navigate(`/templates/workflow_job_template/${id}/visualizer`);
    } catch (err) {
      setFormSubmitError(err);
    }
  };

  const submitLabels = async (
    templateId: number,
    organizationId: number | undefined,
    labels: SummaryFieldRef[] = []
  ) => {
    if (!organizationId) {
      // eslint-disable-next-line no-useless-catch
      try {
        const {
          data: { results },
        } = await OrganizationsAPI.read();
        organizationId = results[0]?.id;
      } catch (err) {
        throw err;
      }
    }
    const associatePromises = labels.map((label) =>
      WorkflowJobTemplatesAPI.associateLabel(
        templateId,
        label as { id: number; name: string },
        organizationId as number
      )
    );
    return [...associatePromises];
  };

  const handleCancel = () => {
    navigate(`/templates`);
  };

  const {
    isLoading,
    request: fetchUserRole,
    result: { orgAdminResults, isOrgAdmin },
    error: contentError,
  } = useRequest(
    useCallback(async () => {
      const {
        data: { results, count },
      } = await UsersAPI.readAdminOfOrganizations(me?.id as number);
      return { isOrgAdmin: count > 0, orgAdminResults: results };
    }, [me?.id]),
    { isOrgAdmin: false, orgAdminResults: null }
  );

  useEffect(() => {
    fetchUserRole();
  }, [fetchUserRole]);

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  if (isLoading || !orgAdminResults) {
    return <ContentLoading />;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <CardBody>
          <WorkflowJobTemplateForm
            handleCancel={handleCancel}
            handleSubmit={handleSubmit}
            submitError={formSubmitError}
            isOrgAdmin={isOrgAdmin}
          />
        </CardBody>
      </Card>
    </PageSection>
  );
}

export default WorkflowJobTemplateAdd;
