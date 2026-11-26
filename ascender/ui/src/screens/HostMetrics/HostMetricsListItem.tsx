import type { HostMetric } from 'types/api';
import React from 'react';
import { Tr, Td } from '@patternfly/react-table';
import { formatDateString } from 'util/dates';
import { useLingui } from '@lingui/react/macro';

export interface HostMetricsListItemProps {
  item: HostMetric;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  /**
   * Whether the row carries a checkbox. Selecting a row is only ever for the
   * soft delete, so a viewer the api refuses it to has nothing to select.
   */
  isSelectable?: boolean;
  [key: string]: unknown;
}

function HostMetricsListItem({
  item,
  isSelected,
  onSelect,
  rowIndex,
  isSelectable = true,
}: HostMetricsListItemProps) {
  const { t } = useLingui();
  return (
    <Tr
      id={`host_metrics-row-${item.hostname}`}
      ouiaId={`host-metrics-row-${item.hostname}`}
    >
      {isSelectable && (
        <Td
          select={{ rowIndex, isSelected, onSelect }}
          dataLabel={t`Selected`}
        />
      )}
      <Td dataLabel={t`Hostname`}>{item.hostname}</Td>
      <Td dataLabel={t`First Automated`} modifier="nowrap">
        {formatDateString(item.first_automation)}
      </Td>
      <Td dataLabel={t`Last Automated`} modifier="nowrap">
        {formatDateString(item.last_automation)}
      </Td>
      <Td dataLabel={t`Automation`}>{item.automated_counter}</Td>
      <Td dataLabel={t`Deleted`}>{item.deleted_counter}</Td>
    </Tr>
  );
}

export default HostMetricsListItem;
