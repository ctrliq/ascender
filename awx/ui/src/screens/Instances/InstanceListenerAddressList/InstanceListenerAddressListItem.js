import React from 'react';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import 'styled-components/macro';
import { Tr, Td } from '@patternfly/react-table';

function InstanceListenerAddressListItem({
  peerListenerAddress,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const labelId = `check-action-${peerListenerAddress.id}`;
  return (
    <Tr
      id={`peerListenerAddress-row-${peerListenerAddress.id}`}
      ouiaId={`peerListenerAddress-row-${peerListenerAddress.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />

      <Td id={labelId} dataLabel={i18n._(t`Address`)}>
        {peerListenerAddress.address}
      </Td>

      <Td id={labelId} dataLabel={i18n._(t`Port`)}>
        {peerListenerAddress.port}
      </Td>

      <Td id={labelId} dataLabel={i18n._(t`Protocol`)}>
        {peerListenerAddress.protocol}
      </Td>

      <Td id={labelId} dataLabel={i18n._(t`Canonical`)}>
        {peerListenerAddress.canonical.toString()}
      </Td>
    </Tr>
  );
}

export default InstanceListenerAddressListItem;
