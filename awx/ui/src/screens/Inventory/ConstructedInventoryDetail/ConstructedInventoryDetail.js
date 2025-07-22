import React, { useCallback, useEffect } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import {
  Button,
  Chip,
  Label,
  LabelGroup,
  TextList,
  TextListItem,
  TextListItemVariants,
  TextListVariants,
  Tooltip,
} from '@patternfly/react-core';
import { InventoriesAPI, ConstructedInventoriesAPI } from 'api';
import { Inventory } from 'types';
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
import Popover from 'components/Popover';
import StatusLabel from 'components/StatusLabel';
import ConstructedInventorySyncButton from './ConstructedInventorySyncButton';
import useWsInventorySourcesDetails from '../shared/useWsInventorySourcesDetails';
import getHelpText from '../shared/Inventory.helptext';

function JobStatusLabel({ job }) {
  const { i18n } = useLingui();
  if (!job) {
    return null;
  }

  return (
    <Tooltip
      position="top"
      content={
        <>
          <div>{i18n._(msg`MOST RECENT SYNC`)}</div>
          <div>
            {i18n._(msg`JOB ID:`)} {job.id}
          </div>
          <div>
            {i18n._(msg`STATUS:`)} {job.status.toUpperCase()}
          </div>
          {job.finished && (
            <div>
              {i18n._(msg`FINISHED:`)} {formatDateString(job.finished)}
            </div>
          )}
        </>
      }
      key={job.id}
    >
      <Link to={`/jobs/inventory/${job.id}`}>
        <StatusLabel status={job.status} />
      </Link>
    </Tooltip>
  );
}

function ConstructedInventoryDetail({ inventory }) {
  const { i18n } = useLingui();
  const history = useHistory();
  const helpText = getHelpText(i18n);

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
        actions: optionsResponse.data.actions.GET,
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

  const wsInventorySource = useWsInventorySourcesDetails(inventorySource);
  const inventorySourceSyncJob =
    wsInventorySource.summary_fields?.current_job ||
    wsInventorySource.summary_fields?.last_job ||
    null;
  const wsInventory = {
    ...inventory,
    ...wsInventorySource?.summary_fields?.inventory,
  };

  const { request: deleteInventory, error: deleteError } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(inventory.id);
      history.push(`/inventories`);
    }, [inventory.id, history])
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
          label={i18n._(msg`Name`)}
          value={inventory.name}
          dataCy="constructed-inventory-name"
        />
        <Detail
          label={i18n._(msg`Last Job Status`)}
          value={
            inventorySourceSyncJob && (
              <JobStatusLabel job={inventorySourceSyncJob} />
            )
          }
        />
        <Detail
          label={i18n._(msg`Description`)}
          value={inventory.description}
          dataCy="constructed-inventory-description"
        />
        <Detail
          label={i18n._(msg`Type`)}
          value={i18n._(msg`Constructed Inventory`)}
          dataCy="constructed-inventory-type"
        />
        <Detail
          label={actions.limit.label}
          value={inventory.limit}
          helpText={actions.limit.help_text}
          dataCy="constructed-inventory-limit"
        />
        <Detail
          label={i18n._(msg`Organization`)}
          dataCy="constructed-inventory-organization"
          value={
            <Link
              to={`/organizations/${inventory.summary_fields?.organization.id}/details`}
            >
              {inventory.summary_fields?.organization.name}
            </Link>
          }
        />
        <Detail
          label={actions.total_groups.label}
          value={wsInventory.total_groups}
          helpText={actions.total_groups.help_text}
          dataCy="constructed-inventory-total-groups"
        />
        <Detail
          label={actions.total_hosts.label}
          value={wsInventory.total_hosts}
          helpText={actions.total_hosts.help_text}
          dataCy="constructed-inventory-total-hosts"
        />
        <Detail
          label={actions.total_inventory_sources.label}
          value={wsInventory.total_inventory_sources}
          helpText={actions.total_inventory_sources.help_text}
          dataCy="constructed-inventory-sources"
        />
        <Detail
          label={actions.update_cache_timeout.label}
          value={inventory.update_cache_timeout}
          helpText={actions.update_cache_timeout.help_text}
          dataCy="constructed-inventory-cache-timeout"
        />
        <Detail
          label={actions.inventory_sources_with_failures.label}
          value={wsInventory.inventory_sources_with_failures}
          helpText={actions.inventory_sources_with_failures.help_text}
          dataCy="constructed-inventory-sources-with-failures"
        />
        <Detail
          label={actions.verbosity.label}
          value={inventory.verbosity}
          helpText={actions.verbosity.help_text}
          dataCy="constructed-inventory-verbosity"
        />
        {instanceGroups && (
          <Detail
            fullWidth
            label={i18n._(msg`Instance Groups`)}
            value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
            isEmpty={instanceGroups.length === 0}
            dataCy="constructed-inventory-instance-groups"
          />
        )}
        {inventory.prevent_instance_group_fallback && (
          <Detail
            fullWidth
            label={i18n._(msg`Enabled Options`)}
            dataCy="constructed-inventory-instance-group-fallback"
            value={
              <TextList component={TextListVariants.ul}>
                {inventory.prevent_instance_group_fallback && (
                  <TextListItem component={TextListItemVariants.li}>
                    {i18n._(msg`Prevent Instance Group Fallback`)}
                    <Popover
                      header={i18n._(msg`Prevent Instance Group Fallback`)}
                      content={helpText.preventInstanceGroupFallback}
                    />
                  </TextListItem>
                )}
              </TextList>
            }
          />
        )}
        <Detail
          fullWidth
          helpText={helpText.labels}
          dataCy="constructed-inventory-labels"
          label={i18n._(msg`Labels`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={inventory.summary_fields.labels?.results?.length}
            >
              {inventory.summary_fields.labels?.results?.map((l) => (
                <Chip key={l.id} isReadOnly>
                  {l.name}
                </Chip>
              ))}
            </ChipGroup>
          }
          isEmpty={inventory.summary_fields.labels?.results?.length === 0}
        />
        <Detail
          fullWidth
          label={i18n._(msg`Input Inventories`)}
          value={
            <LabelGroup numLabels={5}>
              {inputInventories?.map((inputInventory) => (
                <Label
                  color="blue"
                  key={inputInventory.id}
                  render={({ className, content, componentRef }) => (
                    <Link
                      className={className}
                      innerRef={componentRef}
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
          label={actions.source_vars.label}
          helpText={helpText.variables()}
          value={inventory.source_vars}
          rows={4}
          name="variables"
          dataCy="inventory-detail-variables"
        />
        <UserDateDetail
          label={actions.created.label}
          date={inventory.created}
          user={inventory.summary_fields.created_by}
        />
        <UserDateDetail
          label={actions.modified.label}
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
            {i18n._(msg`Edit`)}
          </Button>
        )}
        {inventorySource?.summary_fields?.user_capabilities?.start &&
          (['new', 'running', 'pending', 'waiting'].includes(
            inventorySourceSyncJob?.status
          ) ? (
            <JobCancelButton
              job={{ id: inventorySourceSyncJob.id, type: 'inventory_update' }}
              errorTitle={i18n._(msg`Constructed Inventory Source Sync Error`)}
              title={i18n._(msg`Cancel Constructed Inventory Source Sync`)}
              errorMessage={i18n._(
                msg`Failed to cancel Constructed Inventory Source Sync`
              )}
              buttonText={i18n._(msg`Cancel Sync`)}
            />
          ) : (
            <ConstructedInventorySyncButton inventoryId={inventory.id} />
          ))}
        {inventory?.summary_fields?.user_capabilities?.delete && (
          <DeleteButton
            name={inventory.name}
            modalTitle={i18n._(msg`Delete Inventory`)}
            onConfirm={deleteInventory}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={i18n._(
              msg`This inventory is currently being used by other resources. Are you sure you want to delete it?`
            )}
          >
            {i18n._(msg`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete inventory.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

ConstructedInventoryDetail.propTypes = {
  inventory: Inventory.isRequired,
};

export default ConstructedInventoryDetail;
