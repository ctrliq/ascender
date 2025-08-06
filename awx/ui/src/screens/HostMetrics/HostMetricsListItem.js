import 'styled-components/macro';
import React from 'react';
import { Tr, Td } from '@patternfly/react-table';
import { formatDateString } from 'util/dates';
import { HostMetrics } from 'types';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { bool, func } from 'prop-types';

function HostMetricsListItem({ item, isSelected, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  return (
    <Tr
      id={`host_metrics-row-${item.hostname}`}
      ouiaId={`host-metrics-row-${item.hostname}`}
    >
      <Td
        select={{ rowIndex, isSelected, onSelect }}
        dataLabel={i18n._(t`Selected`)}
      />
      <Td dataLabel={i18n._(t`Hostname`)}>{item.hostname}</Td>
      <Td dataLabel={i18n._(t`First automation`)}>
        {formatDateString(item.first_automation)}
      </Td>
      <Td dataLabel={i18n._(t`Last automation`)}>
        {formatDateString(item.last_automation)}
      </Td>
      <Td dataLabel={i18n._(t`Automation`)}>{item.automated_counter}</Td>
      <Td dataLabel={i18n._(t`Deleted`)}>{item.deleted_counter}</Td>
    </Tr>
  );
}

HostMetricsListItem.propTypes = {
  item: HostMetrics.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
};

export default HostMetricsListItem;
