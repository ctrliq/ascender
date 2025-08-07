import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Td, Tr } from '@patternfly/react-table';

function HostListItem({ item }) {
  const { t } = useLingui();
  return (
    <Tr ouiaId={`host-list-item-${item.id}`}>
      <Td dataLabel={t`Name`}>{item.name}</Td>
      <Td dataLabel={t`Description`}>{item.description}</Td>
      <Td dataLabel={t`Inventory`}>
        {item.summary_fields.inventory.name}
      </Td>
    </Tr>
  );
}

export default HostListItem;
