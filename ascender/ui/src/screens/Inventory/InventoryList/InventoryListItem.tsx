import type { AnyInventory } from 'types/api';
import React, { useState, useCallback } from 'react';

import { Button, Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import { Plural, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { timeOfDay } from 'util/dates';
import { InventoriesAPI } from 'api';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import CopyButton from 'components/CopyButton';
import StatusLabel from 'components/StatusLabel';
import { getInventoryPath } from '../shared/utils';

export interface InventoryListItemProps {
  inventory: AnyInventory;
  rowIndex: number;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  onCopy: (id: number) => void;
  /** Re-reads the page once the copy has landed. */
  fetchInventories: () => unknown;
  [key: string]: unknown;
}

function InventoryListItem({
  inventory,
  rowIndex,
  isSelected,
  onSelect,
  onCopy,
  fetchInventories,
}: InventoryListItemProps) {
  const { t } = useLingui();
  const [isCopying, setIsCopying] = useState(false);

  const copyInventory = useCallback(async () => {
    const response = await InventoriesAPI.copy(inventory.id, {
      name: `${inventory.name} @ ${timeOfDay()}`,
    });
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchInventories();
  }, [inventory.id, inventory.name, fetchInventories, onCopy]);

  const handleCopyStart = useCallback(() => {
    setIsCopying(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsCopying(false);
  }, []);

  const labelId = `check-action-${inventory.id}`;

  const typeLabel = {
    '': t`Inventory`,
    smart: t`Smart Inventory`,
    constructed: t`Constructed Inventory`,
    federated: t`Federated Inventory`,
  };

  const failedSources = inventory.inventory_sources_with_failures ?? 0;
  let syncStatus = 'disabled';
  if (inventory.isSourceSyncRunning) {
    syncStatus = 'syncing';
  } else if (inventory.has_inventory_sources) {
    syncStatus = failedSources > 0 ? 'error' : 'success';
  }

  let tooltipContent: React.ReactNode = '';
  if (inventory.has_inventory_sources) {
    if (failedSources > 0) {
      tooltipContent = (
        <Plural
          // Not the local above: lingui names this placeholder after the
          // expression, so a bare identifier would change the message id and
          // orphan every translation of the string.
          value={inventory.inventory_sources_with_failures ?? 0}
          one="# source with sync failures."
          other="# sources with sync failures."
        />
      );
    } else {
      tooltipContent = t`No inventory sync failures.`;
    }
  } else {
    tooltipContent = t`Not configured for inventory sync.`;
  }

  return (
    <Tr
      id={`${inventory.id}`}
      aria-labelledby={labelId}
      ouiaId={`inventory-row-${inventory.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <TdBreakWord id={labelId} dataLabel={t`Name`}>
        {inventory.pending_deletion ? (
          <b>{inventory.name}</b>
        ) : (
          <Link to={`${getInventoryPath(inventory)}/details`}>
            <b>{inventory.name}</b>
          </Link>
        )}
      </TdBreakWord>
      <Td dataLabel={t`Status`}>
        {inventory.kind === '' &&
          (inventory.has_inventory_sources ? (
            <Link
              to={`${getInventoryPath(
                inventory
              )}/jobs?job.or__inventoryupdate__inventory_source__inventory__id=${
                inventory.id
              }`}
            >
              <StatusLabel
                status={syncStatus}
                tooltipContent={tooltipContent}
              />
            </Link>
          ) : (
            <StatusLabel status={syncStatus} tooltipContent={tooltipContent} />
          ))}
      </Td>
      <Td dataLabel={t`Type`}>
        {typeLabel[inventory.kind as keyof typeof typeLabel]}
      </Td>
      <TdBreakWord key="organization" dataLabel={t`Organization`}>
        <Link
          to={`/organizations/${inventory?.summary_fields?.organization?.id}/details`}
        >
          {inventory?.summary_fields?.organization?.name}
        </Link>
      </TdBreakWord>
      {inventory.pending_deletion ? (
        <Td dataLabel={t`Groups`}>
          <Label color="red">{t`Pending delete`}</Label>
        </Td>
      ) : (
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem
            visible={inventory.summary_fields.user_capabilities?.edit}
            tooltip={t`Edit Inventory`}
          >
            <Button
              icon={<PencilAltIcon />}
              ouiaId={`${inventory.id}-edit-button`}
              isDisabled={isCopying}
              aria-label={t`Edit Inventory`}
              variant="plain"
              component={Link}
              to={`${getInventoryPath(inventory)}/edit`}
            />
          </ActionItem>
          <ActionItem
            visible={inventory.summary_fields.user_capabilities?.copy}
            tooltip={
              inventory.has_inventory_sources
                ? t`Inventories with sources cannot be copied`
                : t`Copy Inventory`
            }
          >
            <CopyButton
              copyItem={copyInventory}
              isDisabled={isCopying || inventory.has_inventory_sources}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              errorMessage={t`Failed to copy inventory.`}
              ouiaId={`${inventory.id}-copy-button`}
            />
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}
export default InventoryListItem;
