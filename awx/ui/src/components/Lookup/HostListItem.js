import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { Td, Tr } from '@patternfly/react-table';

function HostListItem({ item }) {
  const { i18n } = useLingui();
  return (
    <Tr ouiaId={`host-list-item-${item.id}`}>
      <Td dataLabel={i18n._(t`Name`)}>{item.name}</Td>
      <Td dataLabel={i18n._(t`Description`)}>{item.description}</Td>
      <Td dataLabel={i18n._(t`Inventory`)}>
        {item.summary_fields.inventory.name}
      </Td>
    </Tr>
  );
}

export default HostListItem;
