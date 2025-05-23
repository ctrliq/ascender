import 'styled-components/macro';
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { string, bool, func, number } from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import { Td, Tr } from '@patternfly/react-table';
import { Button } from '@patternfly/react-core';
import { PencilAltIcon } from '@patternfly/react-icons';

import { Group } from 'types';
import { ActionItem, ActionsTd } from 'components/PaginatedTable';

function InventoryRelatedGroupListItem({
  detailUrl,
  editUrl,
  group,
  rowIndex,
  isSelected,
  onSelect,
}) {
  const { i18n } = useLingui();
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
        dataLabel={i18n._(msg`Selected`)}
      />
      <Td id={labelId}>
        <Link to={`${detailUrl}`}>
          <b>{group.name}</b>
        </Link>
      </Td>
      {inventoryType !== 'constructed_inventory' && (
        <ActionsTd dataLabel={i18n._(msg`Actions`)}>
          <ActionItem
            tooltip={i18n._(msg`Edit Group`)}
            visible={group.summary_fields.user_capabilities?.edit}
          >
            <Button
              ouiaId={`${group.id}-edit-button`}
              aria-label={i18n._(msg`Edit Group`)}
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

InventoryRelatedGroupListItem.propTypes = {
  detailUrl: string.isRequired,
  editUrl: string.isRequired,
  group: Group.isRequired,
  rowIndex: number.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default InventoryRelatedGroupListItem;
