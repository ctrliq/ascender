import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Td, Tr } from '@patternfly/react-table';

function HostListItem({ item }) {
  const { i18n } = useLingui();
  return (
    <Tr ouiaId={`host-list-item-${item.id}`}>
      <Td dataLabel={i18n._(msg`Name`)}>{item.name}</Td>
      <Td dataLabel={i18n._(msg`Description`)}>{item.description}</Td>
      <Td dataLabel={i18n._(msg`Inventory`)}>{item.summary_fields.inventory.name}</Td>
    </Tr>
  );
}

export default HostListItem;
