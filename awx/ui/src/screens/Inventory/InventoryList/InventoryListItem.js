import React, { useState, useCallback } from 'react';
import { bool, func } from 'prop-types';

import { Button, Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import { t, Plural } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';
import { timeOfDay } from 'util/dates';
import { InventoriesAPI } from 'api';
import { Inventory } from 'types';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import CopyButton from 'components/CopyButton';
import StatusLabel from 'components/StatusLabel';
import { getInventoryPath } from '../shared/utils';

function InventoryListItem({
  inventory,
  rowIndex,
  isSelected,
  onSelect,
  onCopy,
  fetchInventories,
}) {
  const { i18n } = useLingui();
  InventoryListItem.propTypes = {
    inventory: Inventory.isRequired,
    isSelected: bool.isRequired,
    onSelect: func.isRequired,
  };
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
    '': i18n._(t`Inventory`),
    smart: i18n._(t`Smart Inventory`),
    constructed: i18n._(t`Constructed Inventory`),
  };

  let syncStatus = 'disabled';
  if (inventory.isSourceSyncRunning) {
    syncStatus = 'syncing';
  } else if (inventory.has_inventory_sources) {
    syncStatus =
      inventory.inventory_sources_with_failures > 0 ? 'error' : 'success';
  }

  let tooltipContent = '';
  if (inventory.has_inventory_sources) {
    if (inventory.inventory_sources_with_failures > 0) {
      tooltipContent = (
        <Plural
          value={inventory.inventory_sources_with_failures}
          one={i18n._(t`# source with sync failures.`)}
          other={i18n._(t`# sources with sync failures.`)}
        />
      );
    } else {
      tooltipContent = i18n._(t`No inventory sync failures.`);
    }
  } else {
    tooltipContent = i18n._(t`Not configured for inventory sync.`);
  }

  return (
    <Tr
      id={inventory.id}
      aria-labelledby={labelId}
      ouiaId={`inventory-row-${inventory.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <TdBreakWord id={labelId} dataLabel={i18n._(t`Name`)}>
        {inventory.pending_deletion ? (
          <b>{inventory.name}</b>
        ) : (
          <Link to={`${getInventoryPath(inventory)}/details`}>
            <b>{inventory.name}</b>
          </Link>
        )}
      </TdBreakWord>
      <Td dataLabel={i18n._(t`Status`)}>
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
      <Td dataLabel={i18n._(t`Type`)}>{typeLabel[inventory.kind]}</Td>
      <TdBreakWord key="organization" dataLabel={i18n._(t`Organization`)}>
        <Link
          to={`/organizations/${inventory?.summary_fields?.organization?.id}/details`}
        >
          {inventory?.summary_fields?.organization?.name}
        </Link>
      </TdBreakWord>
      {inventory.pending_deletion ? (
        <Td dataLabel={i18n._(t`Groups`)}>
          <Label color="red">{i18n._(t`Pending delete`)}</Label>
        </Td>
      ) : (
        <ActionsTd dataLabel={i18n._(t`Actions`)}>
          <ActionItem
            visible={inventory.summary_fields.user_capabilities.edit}
            tooltip={i18n._(t`Edit Inventory`)}
          >
            <Button
              ouiaId={`${inventory.id}-edit-button`}
              isDisabled={isCopying}
              aria-label={i18n._(t`Edit Inventory`)}
              variant="plain"
              component={Link}
              to={`${getInventoryPath(inventory)}/edit`}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
          <ActionItem
            visible={inventory.summary_fields.user_capabilities.copy}
            tooltip={
              inventory.has_inventory_sources
                ? i18n._(t`Inventories with sources cannot be copied`)
                : i18n._(t`Copy Inventory`)
            }
          >
            <CopyButton
              copyItem={copyInventory}
              isDisabled={isCopying || inventory.has_inventory_sources}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              errorMessage={i18n._(t`Failed to copy inventory.`)}
              ouiaId={`${inventory.id}-copy-button`}
            />
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}
export default InventoryListItem;
