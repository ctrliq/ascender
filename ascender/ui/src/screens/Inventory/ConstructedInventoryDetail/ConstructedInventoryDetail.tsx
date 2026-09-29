import type {
  ConstructedInventory,
  InventorySource,
  SummaryFieldRef,
} from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import {
  Button,
  Label,
  LabelGroup,
  Content,
  ContentVariants,
} from '@patternfly/react-core';

import { InventoriesAPI, ConstructedInventoriesAPI } from 'api';
import { formatDateString } from 'util/dates';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import JobCancelButton from 'components/JobCancelButton';
import useCanCancelSync from 'hooks/useCanCancelSync';
import { getRunActionLabels, isJobCancelable } from 'util/jobs';
import Popover from 'components/Popover';
import StatusLabel from 'components/StatusLabel';
import Tooltip from 'components/Tooltip';
import InventorySyncAllButton from '../shared/InventorySyncAllButton';
import useWsInventorySourcesDetails from '../shared/useWsInventorySourcesDetails';
import getHelpText from '../shared/Inventory.helptext';

export interface JobStatusLabelProps {
  job?: SummaryFieldRef & { status?: string; finished?: string | null };
}

function JobStatusLabel({ job }: JobStatusLabelProps) {
  const { t } = useLingui();
  if (!job) {
    return null;
  }

  return (
    <Tooltip
      position="top"
      content={
        <>
          <div>{t`MOST RECENT SYNC`}</div>
          <div>
            {t`JOB ID:`} {job.id}
          </div>
          <div>
            {t`STATUS:`} {job.status?.toUpperCase()}
          </div>
          {job.finished && (
            <div>
              {t`FINISHED:`} {formatDateString(job.finished)}
            </div>
          )}
        </>
      }
      key={job.id}
    >
      <Link to={`/runs/inventory/${job.id}`}>
        <StatusLabel status={job.status} />
      </Link>
    </Tooltip>
  );
}

export interface ConstructedInventoryDetailProps {
  inventory: ConstructedInventory;
}

function ConstructedInventoryDetail({
  inventory,
}: ConstructedInventoryDetailProps) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const helpText = getHelpText();

  const {
    result: { instanceGroups, inputInventories, inventorySource, actions },
    request: fetchRelatedDetails,
    error: contentError,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const [
        instanceGroupsResponse,
        inputInventoriesResponse,
        inventorySourceResponse,
        optionsResponse,
      ] = await Promise.all([
        InventoriesAPI.readInstanceGroups(inventory.id),
        InventoriesAPI.readInputInventories(inventory.id),
        InventoriesAPI.readSources(inventory.id),
        ConstructedInventoriesAPI.readOptions(),
      ]);

      return {
        instanceGroups: instanceGroupsResponse.data.results,
        inputInventories: inputInventoriesResponse.data.results,
        inventorySource: inventorySourceResponse.data.results[0],
        actions: optionsResponse.data.actions.GET ?? {},
      };
    }, [inventory.id]),
    {
      instanceGroups: [],
      inputInventories: [],
      inventorySource: {},
      actions: {},
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchRelatedDetails();
  }, [fetchRelatedDetails]);

  const wsInventorySource = useWsInventorySourcesDetails(
    inventorySource as InventorySource
  );
  const inventorySourceSyncJob =
    wsInventorySource.summary_fields?.current_job ||
    wsInventorySource.summary_fields?.last_job ||
    null;
  // The sync runs as the constructed inventory's one source, whose cancel
  // the api grants to an admin of the inventory itself.
  const canCancelSync = useCanCancelSync(
    'inventory_update',
    inventorySourceSyncJob?.id as number | undefined,
    inventorySourceSyncJob?.status as string | undefined,
    inventory?.summary_fields?.user_capabilities?.edit
  );
  const wsInventory = {
    ...inventory,
    ...wsInventorySource?.summary_fields?.inventory,
  };

  const { request: deleteInventory, error: deleteError } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(inventory.id);
      navigate(`/inventories`);
    }, [inventory.id, navigate])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const deleteDetailsRequests =
    relatedResourceDeleteRequests.inventory(inventory);

  if (isLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Name`}
          value={inventory.name}
          dataCy="constructed-inventory-name"
        />
        <Detail
          label={t`Last Job Status`}
          value={
            inventorySourceSyncJob && (
              <JobStatusLabel job={inventorySourceSyncJob} />
            )
          }
        />
        <Detail
          label={t`Description`}
          value={inventory.description}
          dataCy="constructed-inventory-description"
        />
        <Detail
          label={t`Type`}
          value={t`Constructed Inventory`}
          dataCy="constructed-inventory-type"
        />
        <Detail
          label={t`Limit`}
          value={inventory.limit}
          helpText={actions.limit?.help_text}
          dataCy="constructed-inventory-limit"
        />
        <Detail
          label={t`Organization`}
          dataCy="constructed-inventory-organization"
          value={
            <Link
              to={`/organizations/${inventory.summary_fields?.organization?.id}/details`}
            >
              {inventory.summary_fields?.organization?.name}
            </Link>
          }
        />
        <Detail
          label={t`Total Groups`}
          value={wsInventory.total_groups}
          helpText={actions.total_groups?.help_text}
          dataCy="constructed-inventory-total-groups"
        />
        <Detail
          label={t`Total Hosts`}
          value={wsInventory.total_hosts}
          helpText={actions.total_hosts?.help_text}
          dataCy="constructed-inventory-total-hosts"
        />
        <Detail
          label={t`Total Inventory Sources`}
          value={wsInventory.total_inventory_sources}
          helpText={actions.total_inventory_sources?.help_text}
          dataCy="constructed-inventory-sources"
        />
        <Detail
          label={t`Cache Timeout`}
          value={inventory.update_cache_timeout}
          helpText={actions.update_cache_timeout?.help_text}
          dataCy="constructed-inventory-cache-timeout"
        />
        <Detail
          label={t`Inventory Sources With Failures`}
          value={wsInventory.inventory_sources_with_failures}
          helpText={actions.inventory_sources_with_failures?.help_text}
          dataCy="constructed-inventory-sources-with-failures"
        />
        <Detail
          label={t`Verbosity`}
          value={inventory.verbosity}
          helpText={actions.verbosity?.help_text}
          dataCy="constructed-inventory-verbosity"
        />
        {instanceGroups && (
          <Detail
            fullWidth
            label={t`Instance Groups`}
            value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
            isEmpty={instanceGroups.length === 0}
            dataCy="constructed-inventory-instance-groups"
          />
        )}
        {inventory.prevent_instance_group_fallback && (
          <Detail
            fullWidth
            label={t`Options`}
            dataCy="constructed-inventory-instance-group-fallback"
            value={
              <Content component={ContentVariants.ul}>
                {inventory.prevent_instance_group_fallback && (
                  <Content component={ContentVariants.li}>
                    {t`Prevent Instance Group Fallback`}
                    <Popover
                      header={t`Prevent Instance Group Fallback`}
                      content={helpText.preventInstanceGroupFallback}
                    />
                  </Content>
                )}
              </Content>
            }
          />
        )}
        <Detail
          fullWidth
          helpText={helpText.labels}
          dataCy="constructed-inventory-labels"
          label={t`Labels`}
          value={
            <ChipGroup
              numChips={5}
              totalChips={inventory.summary_fields.labels?.results?.length ?? 0}
            >
              {inventory.summary_fields.labels?.results?.map(
                (l: SummaryFieldRef) => (
                  <Label variant="outline" key={l.id}>
                    {l.name}
                  </Label>
                )
              )}
            </ChipGroup>
          }
          isEmpty={inventory.summary_fields.labels?.results?.length === 0}
        />
        <Detail
          fullWidth
          label={t`Input Inventories`}
          value={
            <LabelGroup numLabels={5}>
              {inputInventories?.map((inputInventory: SummaryFieldRef) => (
                <Label
                  color="blue"
                  key={inputInventory.id}
                  render={({ className, content, componentRef }) => (
                    <Link
                      className={className}
                      ref={componentRef}
                      to={`/inventories/inventory/${inputInventory.id}/details`}
                    >
                      {content}
                    </Link>
                  )}
                >
                  {inputInventory.name}
                </Label>
              ))}
            </LabelGroup>
          }
          isEmpty={inputInventories?.length === 0}
        />
        <VariablesDetail
          label={t`Source Variables`}
          helpText={helpText.variables()}
          value={inventory.source_vars}
          rows={4}
          name="variables"
          dataCy="inventory-detail-variables"
        />
        <UserDateDetail
          label={t`Created`}
          date={inventory.created}
          user={inventory.summary_fields.created_by}
        />
        <UserDateDetail
          label={t`Last Modified`}
          date={inventory.modified}
          user={inventory.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {inventory?.summary_fields?.user_capabilities?.edit && (
          <Button
            ouiaId="inventory-detail-edit-button"
            component={Link}
            to={`/inventories/constructed_inventory/${inventory.id}/edit`}
          >
            {t`Edit`}
          </Button>
        )}
        {/* While a sync can still be stopped the place of Sync is taken by
            its Cancel, for whoever the api lets cancel it. */}
        {isJobCancelable(inventorySourceSyncJob?.status as string | undefined)
          ? canCancelSync && (
              <JobCancelButton
                job={{
                  id: inventorySourceSyncJob!.id,
                  type: 'inventory_update',
                }}
                /* The shared wording for this kind of run, the one the runs
                   list and the run's own page use. */
                title={i18n._(getRunActionLabels('inventory_update').cancel)}
              />
            )
          : inventorySource?.summary_fields?.user_capabilities?.start && (
              <InventorySyncAllButton inventoryId={inventory.id} />
            )}
        {inventory?.summary_fields?.user_capabilities?.delete && (
          <DeleteButton
            name={inventory.name}
            modalTitle={t`Delete Inventory`}
            onConfirm={deleteInventory}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={t`This inventory is currently being used by other resources. Are you sure you want to delete it?`}
          >
            {t`Delete`}
          </DeleteButton>
        )}
      </CardActionsRow>
      {Boolean(error) && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {t`Failed to delete inventory.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default ConstructedInventoryDetail;
