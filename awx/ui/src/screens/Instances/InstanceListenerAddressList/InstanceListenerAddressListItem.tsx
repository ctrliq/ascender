import type { ReceptorAddress } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';

export interface InstanceListenerAddressListItemProps {
  peerListenerAddress: ReceptorAddress;
  isSelected: boolean;
  onSelect: () => void;
  rowIndex: number;
  [key: string]: unknown;
}

function InstanceListenerAddressListItem({
  peerListenerAddress,
  isSelected,
  onSelect,
  rowIndex,
}: InstanceListenerAddressListItemProps) {
  const { t } = useLingui();
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
        dataLabel={t`Selected`}
      />

      <Td id={labelId} dataLabel={t`Address`}>
        {peerListenerAddress.address}
      </Td>

      <Td id={labelId} dataLabel={t`Port`}>
        {peerListenerAddress.port}
      </Td>

      <Td id={labelId} dataLabel={t`Protocol`}>
        {peerListenerAddress.protocol}
      </Td>

      <Td id={labelId} dataLabel={t`Canonical`}>
        {String(peerListenerAddress.canonical)}
      </Td>
    </Tr>
  );
}

export default InstanceListenerAddressListItem;
