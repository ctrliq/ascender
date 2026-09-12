import type { SummaryFieldRef, WorkflowJobTemplate } from 'types/api';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';

import { CardBody } from 'components/Card';
import { getAddedAndRemoved } from 'util/lists';
import {
  InventoriesAPI,
  WorkflowJobTemplatesAPI,
  OrganizationsAPI,
  UsersAPI,
} from 'api';
import { useConfig } from 'contexts/Config';
import useRequest from 'hooks/useRequest';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { WorkflowJobTemplateForm } from '../shared';
import type { WorkflowJobTemplateFormValues } from '../shared/WorkflowJobTemplateForm';

export interface WorkflowJobTemplateEditProps {
  template: WorkflowJobTemplate;
  [key: string]: unknown;
}

function WorkflowJobTemplateEdit({ template }: WorkflowJobTemplateEditProps) {
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
    payload.inventory = inventory?.id || null;
    payload.organization = organization?.id || null;
    payload.webhook_credential = webhook_credential?.id || null;
    if (webhook_key) {
      payload.webhook_key = webhook_key;
    }
    payload.limit = limit === '' ? null : limit;
    payload.job_tags = job_tags === '' ? null : job_tags;
    payload.skip_tags = skip_tags === '' ? null : skip_tags;
    payload.scm_branch = scm_branch === '' ? null : scm_branch;

    const formOrgId =
      organization?.id ||
      (inventory?.summary_fields as { organization?: { id?: number } })
        ?.organization?.id ||
      null;
    try {
      await Promise.all(
        await submitLabels(formOrgId, template.organization, labels)
      );
      await WorkflowJobTemplatesAPI.update(template.id, payload);
      navigate(`/templates/workflow_job_template/${template.id}/details`);
    } catch (err) {
      setFormSubmitError(err);
    }
  };

  const submitLabels = async (
    formOrgId: number | null,
    templateOrgId: number | null | undefined,
    labels: SummaryFieldRef[] = []
  ) => {
    const { added, removed } = getAddedAndRemoved(
      template.summary_fields.labels?.results as SummaryFieldRef[] | undefined,
      labels
    );
    let orgId = formOrgId || templateOrgId;
    if (!orgId) {
      // eslint-disable-next-line no-useless-catch
      try {
        const {
          data: { results },
        } = await OrganizationsAPI.read();
        orgId = results[0]?.id;
      } catch (err) {
        throw err;
      }
    }

    const disassociationPromises = await removed.map((label) =>
      WorkflowJobTemplatesAPI.disassociateLabel(
        template.id,
        label as { id: number; name: string }
      )
    );
    const associationPromises = await added.map((label) =>
      WorkflowJobTemplatesAPI.associateLabel(
        template.id,
        label as { id: number; name: string },
        orgId as number
      )
    );
    const results = [...disassociationPromises, ...associationPromises];
    return results;
  };

  const handleCancel = () => {
    navigate(`/templates/workflow_job_template/${template.id}/details`);
  };

  const {
    isLoading: isFetchUserRoleLoading,
    request: fetchUserRole,
    result: { orgAdminResults, isOrgAdmin },
    error: fetchUserRoleError,
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

  const {
    isLoading: isFetchInventoryLoading,
    request: fetchInventory,
    result: { canChangeInventory },
    error: fetchInventoryError,
  } = useRequest(
    useCallback(async () => {
      if (template.inventory) {
        const {
          data: { count },
        } = await InventoriesAPI.read({
          role_level: 'use_role',
          id: template.inventory,
        });
        return { canChangeInventory: count && count > 0 };
      }

      return { canChangeInventory: true };
    }, [template.inventory]),
    { canChangeInventory: false }
  );

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  if (fetchUserRoleError || fetchInventoryError) {
    return <ContentError error={fetchUserRoleError || fetchInventoryError} />;
  }

  if (isFetchUserRoleLoading || isFetchInventoryLoading || !orgAdminResults) {
    return <ContentLoading />;
  }

  return (
    <CardBody>
      <WorkflowJobTemplateForm
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
        template={template}
        submitError={formSubmitError}
        isOrgAdmin={isOrgAdmin}
        isInventoryDisabled={!canChangeInventory}
      />
    </CardBody>
  );
}
export default WorkflowJobTemplateEdit;
