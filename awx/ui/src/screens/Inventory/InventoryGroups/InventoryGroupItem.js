import React from 'react';
import { bool, func } from 'prop-types';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';

import { Link, useParams } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import { Group } from 'types';

function InventoryGroupItem({ group, isSelected, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  const { id: inventoryId, inventoryType } = useParams();
  const labelId = `check-action-${group.id}`;
  const detailUrl = `/inventories/${inventoryType}/${inventoryId}/groups/${group.id}/details`;
  const editUrl = `/inventories/${inventoryType}/${inventoryId}/groups/${group.id}/edit`;

  return (
    <Tr id={`group-row-${group.id}`} ouiaId={`group-row-${group.id}`}>
      <Td
        data-cy={labelId}
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <Td id={labelId} dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`} id={labelId}>
          <b>{group.name}</b>
        </Link>
      </Td>
      {inventoryType !== 'constructed_inventory' && (
        <ActionsTd dataLabel={i18n._(msg`Actions`)} gridColumns="auto 40px">
          <ActionItem
            visible={group.summary_fields.user_capabilities.edit}
            tooltip={i18n._(msg`Edit group`)}
          >
            <Button
              ouiaId={`${group.id}-edit-button`}
              aria-label={i18n._(msg`Edit Group`)}
              variant="plain"
              component={Link}
              to={editUrl}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}

InventoryGroupItem.propTypes = {
  group: Group.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default InventoryGroupItem;
