import type { Host, Untyped, RecentJob } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';
import Sparkline from 'components/Sparkline';

export interface AdvancedInventoryHostListItemProps {
  detailUrl: string;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  inventoryType: Untyped;
  /** The host row, as the hosts list hands it over. */
  host: Host;
  [key: string]: unknown;
}

function AdvancedInventoryHostListItem({
  detailUrl,
  host: {
    name,
    id,
    summary_fields: { recent_jobs, inventory },
  },
  isSelected,
  onSelect,
  rowIndex,
  inventoryType,
}: AdvancedInventoryHostListItemProps) {
  const { t } = useLingui();
  const recentPlaybookJobs = recent_jobs?.map((job: RecentJob) => ({
    ...job,
    type: 'job',
  }));
  const inventoryKind = inventory?.kind === '' ? 'inventory' : inventoryType;
  const inventoryLink = `/inventories/${inventoryKind}/${inventory?.id}/details`;
  return (
    <Tr id={`host-row-${id}`} ouiaId={`host-row-${id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
      />
      <Td dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Recent jobs`}>
        <Sparkline jobs={recentPlaybookJobs} />
      </Td>
      <Td dataLabel={t`Inventory`}>
        <Link to={inventoryLink}>{inventory?.name}</Link>
      </Td>
    </Tr>
  );
}

export default AdvancedInventoryHostListItem;
