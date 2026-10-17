import type { ExecutionEnvironment } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Tr, Td } from '@patternfly/react-table';

export interface OrganizationExecEnvListItemProps {
  executionEnvironment: ExecutionEnvironment;
  detailUrl: string;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  rowIndex: number;
  [key: string]: unknown;
}

function OrganizationExecEnvListItem({
  executionEnvironment,
  detailUrl,
  isSelected,
  onSelect,
  rowIndex,
}: OrganizationExecEnvListItemProps) {
  const { t } = useLingui();
  return (
    <Tr
      id={`ee-row-${executionEnvironment.id}`}
      ouiaId={`ee-row-${executionEnvironment.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <Td dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{executionEnvironment.name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Image`}>{executionEnvironment.image}</Td>
    </Tr>
  );
}

export default OrganizationExecEnvListItem;
