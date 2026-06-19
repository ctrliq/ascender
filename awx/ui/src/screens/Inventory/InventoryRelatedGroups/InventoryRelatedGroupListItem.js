import React from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom-v5-compat';

import { useLingui } from '@lingui/react/macro';

import { Td, Tr } from '@patternfly/react-table';
import { Button } from '@patternfly/react-core';
import { PencilAltIcon } from '@patternfly/react-icons';

import { ActionItem, ActionsTd } from 'components/PaginatedTable';

function InventoryRelatedGroupListItem({
  detailUrl,
  editUrl,
  group,
  rowIndex,
  isSelected,
  onSelect,
}) {
  const { t } = useLingui();
  const labelId = `check-action-${group.id}`;
  const { inventoryType } = useParams();
  return (
    <Tr
      id={group.id}
      ouiaId={`group-row-${group.id}`}
      aria-labelledby={labelId}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <Td id={labelId}>
        <Link to={`${detailUrl}`}>
          <b>{group.name}</b>
        </Link>
      </Td>
      {inventoryType !== 'constructed_inventory' && (
        <ActionsTd dataLabel={t`Actions`}>
          <ActionItem
            tooltip={t`Edit Group`}
            visible={group.summary_fields.user_capabilities?.edit}
          >
            <Button
              ouiaId={`${group.id}-edit-button`}
              aria-label={t`Edit Group`}
              variant="plain"
              component={Link}
              to={`${editUrl}`}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}

export default InventoryRelatedGroupListItem;
