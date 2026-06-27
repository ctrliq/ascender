import React from 'react';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';

function InventoryHostGroupItem({
  group,
  inventoryId,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { t } = useLingui();
  const labelId = `check-action-${group.id}`;
  const detailUrl = `/inventories/inventory/${inventoryId}/groups/${group.id}/details`;
  const editUrl = `/inventories/inventory/${inventoryId}/groups/${group.id}/edit`;

  return (
    <Tr
      id={`inventory-host-group-row-${group.id}`}
      ouiaId={`inventory-host-group-row-${group.id}`}
    >
      <Td
        data-cy={labelId}
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <Td id={labelId} dataLabel={t`Name`}>
        <Link to={`${detailUrl}`} id={labelId}>
          <b>{group.name}</b>
        </Link>
      </Td>
      <ActionsTd dataLabel={t`Actions`} gridColumns="auto 40px">
        <ActionItem
          visible={group.summary_fields.user_capabilities.edit}
          tooltip={t`Edit group`}
        >
          <Button icon={<PencilAltIcon />}
            ouiaId={`${group.id}-edit-button`}
            variant="plain"
            component={Link}
            to={editUrl}
           />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default InventoryHostGroupItem;
