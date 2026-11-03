import type { Group } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import { getGroupInventory } from 'screens/Inventory/shared/utils';

export interface HostGroupItemProps {
  group: Group;
  inventoryId?: number | string;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  [key: string]: unknown;
}

function HostGroupItem({
  group,
  inventoryId,
  isSelected,
  onSelect,
  rowIndex,
}: HostGroupItemProps) {
  const { t } = useLingui();
  const labelId = `check-action-${group.id}`;
  const { path: inventoryPath, isReadOnly: isReadOnlyInventory } =
    getGroupInventory(group, inventoryId);
  const detailUrl = `${inventoryPath}/groups/${group.id}/details`;
  const editUrl = `${inventoryPath}/groups/${group.id}/edit`;

  return (
    <Tr id={`group-row-${group.id}`} ouiaId={`group-row-${group.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <Td dataLabel={t`Name`}>
        {' '}
        <Link to={`${detailUrl}`} id={labelId}>
          <b>{group.name}</b>
        </Link>
      </Td>
      {/* A constructed or federated inventory builds its groups from its
          sources, and the api refuses to edit them, so the row offers no
          Edit, as on the same list under the inventory. */}
      {!isReadOnlyInventory && (
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem
            visible={group.summary_fields.user_capabilities?.edit}
            tooltip={t`Edit Group`}
          >
            <Button
              icon={<PencilAltIcon />}
              ouiaId={`${group.id}-edit-button`}
              aria-label={t`Edit Group`}
              variant="plain"
              component={Link}
              to={editUrl}
            />
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}

export default HostGroupItem;
