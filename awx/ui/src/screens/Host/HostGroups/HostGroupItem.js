import React from 'react';
import { bool, func, number, oneOfType, string } from 'prop-types';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { PencilAltIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import { Group } from 'types';

function HostGroupItem({ group, inventoryId, isSelected, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  const labelId = `check-action-${group.id}`;
  const detailUrl = `/inventories/inventory/${inventoryId}/groups/${group.id}/details`;
  const editUrl = `/inventories/inventory/${inventoryId}/groups/${group.id}/edit`;

  return (
    <Tr id={`group-row-${group.id}`} ouiaId={`group-row-${group.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(msg`Selected`)}
      />
      <Td dataLabel={i18n._(msg`Name`)}>
        {' '}
        <Link to={`${detailUrl}`} id={labelId}>
          <b>{group.name}</b>
        </Link>
      </Td>
      <ActionsTd dataLabel={i18n._(msg`Actions`)}>
        <ActionItem
          visible={group.summary_fields.user_capabilities.edit}
          tooltip={i18n._(msg`Edit Group`)}
        >
          <Button
            ouiaId={`${group.id}-edit-button`}
            variant="plain"
            component={Link}
            to={editUrl}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

HostGroupItem.propTypes = {
  group: Group.isRequired,
  inventoryId: oneOfType([number, string]).isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default HostGroupItem;
