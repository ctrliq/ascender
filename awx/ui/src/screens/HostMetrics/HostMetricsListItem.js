import React from 'react';
import { Tr, Td } from '@patternfly/react-table';
import { formatDateString } from 'util/dates';
import { useLingui } from '@lingui/react/macro';

function HostMetricsListItem({ item, isSelected, onSelect, rowIndex }) {
  const { t } = useLingui();
  return (
    <Tr
      id={`host_metrics-row-${item.hostname}`}
      ouiaId={`host-metrics-row-${item.hostname}`}
    >
      <Td
        select={{ rowIndex, isSelected, onSelect }}
        dataLabel={t`Selected`}
      />
      <Td dataLabel={t`Hostname`}>{item.hostname}</Td>
      <Td dataLabel={t`First automation`}>
        {formatDateString(item.first_automation)}
      </Td>
      <Td dataLabel={t`Last automation`}>
        {formatDateString(item.last_automation)}
      </Td>
      <Td dataLabel={t`Automation`}>{item.automated_counter}</Td>
      <Td dataLabel={t`Deleted`}>{item.deleted_counter}</Td>
    </Tr>
  );
}

export default HostMetricsListItem;
