import type { AnyInventory } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Button, Label } from '@patternfly/react-core';

import { InventoriesAPI, UnifiedJobsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import Sparkline from 'components/Sparkline';
import InstanceGroupLabels from 'components/InstanceGroupLabels';

export interface SmartInventoryDetailProps {
  inventory: AnyInventory;
  [key: string]: unknown;
}

function SmartInventoryDetail({ inventory }: SmartInventoryDetailProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const {
    created,
    description,
    host_filter,
    id,
    modified,
    name,
    total_hosts,
    variables,
    summary_fields: {
      created_by,
      modified_by,
      organization,
      user_capabilities,
    },
  } = inventory;

  const {
    error: contentError,
    isLoading: hasContentLoading,
    request: fetchData,
    result: { recentJobs, instanceGroups },
  } = useRequest(
    useCallback(async () => {
      const params = {
        or__job__inventory: id,
        or__workflowjob__inventory: id,
        order_by: '-finished',
        page_size: 10,
      };
      const [{ data: jobData }, { data: igData }] = await Promise.all([
        UnifiedJobsAPI.read(params),
        InventoriesAPI.readInstanceGroups(id),
      ]);
      return {
        recentJobs: jobData.results,
        instanceGroups: igData.results,
      };
    }, [id]),
    {
      recentJobs: [],
      instanceGroups: [],
    }
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const {
    error: deleteError,
    isLoading,
    request: handleDelete,
  } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(id);
      navigate(`/inventories`);
    }, [id, navigate])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  // What the delete dialog lists as relying on this inventory, as for the
  // other kinds of inventory.
  const deleteDetailsRequests =
    relatedResourceDeleteRequests.inventory(inventory);

  if (hasContentLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <>
      <CardBody>
        <DetailList>
          <Detail label={t`Name`} value={name} />
          <Detail
            label={t`Activity`}
            value={<Sparkline jobs={recentJobs} />}
            isEmpty={recentJobs.length === 0}
          />
          <Detail label={t`Description`} value={description} />
          <Detail label={t`Type`} value={t`Smart inventory`} />
          <Detail
            label={t`Organization`}
            value={
              <Link to={`/organizations/${organization?.id}/details`}>
                {organization?.name}
              </Link>
            }
          />
          <Detail
            fullWidth
            label={t`Smart Host Filter`}
            value={<Label variant="outline">{host_filter}</Label>}
          />
          <Detail label={t`Total Hosts`} value={total_hosts} />
          <Detail
            fullWidth
            label={t`Instance Groups`}
            value={<InstanceGroupLabels labels={instanceGroups} />}
            isEmpty={instanceGroups.length === 0}
          />
          <VariablesDetail
            label={t`Variables`}
            value={variables}
            rows={4}
            name="variables"
            dataCy="smart-inventory-detail-variables"
          />
          <UserDateDetail label={t`Created`} date={created} user={created_by} />
          <UserDateDetail
            label={t`Last Modified`}
            date={modified}
            user={modified_by}
          />
        </DetailList>
        <CardActionsRow>
          {user_capabilities?.edit && (
            <Button
              ouiaId="smart-inventory-detail-edit-button"
              component={Link}
              aria-label={t`Edit`}
              to={`/inventories/smart_inventory/${id}/edit`}
            >
              {t`Edit`}
            </Button>
          )}
          {user_capabilities?.delete && (
            <DeleteButton
              name={name}
              modalTitle={t`Delete Smart Inventory`}
              onConfirm={handleDelete}
              isDisabled={isLoading}
              deleteDetailsRequests={deleteDetailsRequests}
              deleteMessage={t`This inventory is currently being used by other resources. Are you sure you want to delete it?`}
            >
              {t`Delete`}
            </DeleteButton>
          )}
        </CardActionsRow>
      </CardBody>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {t`Failed to delete smart inventory.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default SmartInventoryDetail;
