import type { AnyInventory, SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import {
  Label,
  Button,
  Content,
  ContentVariants,
} from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import ChipGroup from 'components/ChipGroup';
import { InventoriesAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import getHelpText from '../shared/Inventory.helptext';
import InventorySyncAllButton from '../shared/InventorySyncAllButton';

export interface InventoryDetailProps {
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryDetail({ inventory }: InventoryDetailProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const helpText = getHelpText();
  const {
    result: instanceGroups,
    isLoading,
    error: instanceGroupsError,
    request: fetchInstanceGroups,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventoriesAPI.readInstanceGroups(inventory.id);
      return data.results;
    }, [inventory.id]),
    []
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  /*
   * The inventory's own capabilities say nothing of syncing, which takes its
   * update role. Every source of it answers start from that same role, so the
   * first one says it for all, as the sources tab and the inventories list
   * decide their Sync. A failed read only leaves the button out.
   */
  const { result: canSync, request: fetchCanSync } = useRequest(
    useCallback(async () => {
      if (!inventory.has_inventory_sources) {
        return false;
      }
      const { data } = await InventoriesAPI.readSources(inventory.id, {
        page_size: 1,
      });
      return Boolean(data.results[0]?.summary_fields?.user_capabilities?.start);
    }, [inventory.id, inventory.has_inventory_sources]),
    false
  );

  useEffect(() => {
    fetchCanSync();
  }, [fetchCanSync]);

  const { request: deleteInventory, error: deleteError } = useRequest(
    useCallback(async () => {
      await InventoriesAPI.destroy(inventory.id);
      navigate(`/inventories`);
    }, [inventory.id, navigate])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const { organization, user_capabilities: userCapabilities } =
    inventory.summary_fields;

  const { prevent_instance_group_fallback, allow_deletes_while_in_use } =
    inventory;

  const deleteDetailsRequests =
    relatedResourceDeleteRequests.inventory(inventory);

  const renderOptionsField =
    prevent_instance_group_fallback || allow_deletes_while_in_use;

  const renderOptions = (
    <Content component={ContentVariants.ul}>
      {prevent_instance_group_fallback && (
        <Content component={ContentVariants.li}>
          {t`Prevent Instance Group Fallback`}
        </Content>
      )}
      {allow_deletes_while_in_use && (
        <Content component={ContentVariants.li}>
          {t`Allow Deletes While In Use`}
        </Content>
      )}
    </Content>
  );

  if (isLoading) {
    return <ContentLoading />;
  }

  if (instanceGroupsError) {
    return <ContentError error={instanceGroupsError} />;
  }

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Name`}
          value={inventory.name}
          dataCy="inventory-detail-name"
        />
        <Detail label={t`Description`} value={inventory.description} />
        <Detail label={t`Type`} value={t`Inventory`} />
        <Detail
          label={t`Organization`}
          value={
            <Link to={`/organizations/${organization?.id}/details`}>
              {organization?.name}
            </Link>
          }
        />
        <Detail label={t`Total Hosts`} value={inventory.total_hosts} />
        {instanceGroups && (
          <Detail
            fullWidth
            label={t`Instance Groups`}
            value={<InstanceGroupLabels labels={instanceGroups} isLinkable />}
            isEmpty={instanceGroups.length === 0}
          />
        )}
        {prevent_instance_group_fallback && (
          <Detail
            label={t`Prevent Instance Group Fallback`}
            dataCy="inv-detail-prevent-instnace-group-fallback"
            helpText={helpText.preventInstanceGroupFallback}
          />
        )}
        {renderOptionsField && (
          <Detail
            fullWidth
            label={t`Options`}
            value={renderOptions}
            dataCy="jt-detail-enabled-options"
            helpText={helpText.enabledOptions}
          />
        )}
        {inventory.summary_fields.labels && (
          <Detail
            fullWidth
            helpText={helpText.labels}
            label={t`Labels`}
            value={
              <ChipGroup
                numChips={5}
                totalChips={
                  inventory.summary_fields.labels?.results?.length ?? 0
                }
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
        )}
        <VariablesDetail
          label={t`Variables`}
          helpText={helpText.variables()}
          value={inventory.variables}
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
        {userCapabilities?.edit && (
          <Button
            ouiaId="inventory-detail-edit-button"
            component={Link}
            to={`/inventories/inventory/${inventory.id}/edit`}
          >
            {t`Edit`}
          </Button>
        )}
        {canSync && (
          <InventorySyncAllButton
            inventoryId={inventory.id}
            tooltip={t`Sync All Sources`}
            errorMessage={t`Failed to sync inventory sources.`}
          />
        )}
        {userCapabilities?.delete && (
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
      {/* Update delete modal to show dependencies https://github.com/ansible/awx/issues/5546 */}
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
export default InventoryDetail;
