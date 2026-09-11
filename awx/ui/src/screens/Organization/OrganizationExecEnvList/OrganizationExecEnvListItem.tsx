import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Tr, Td } from '@patternfly/react-table';

export interface OrganizationExecEnvListItemProps {
  executionEnvironment: Untyped;
  detailUrl: Untyped;
  [key: string]: unknown;
}

function OrganizationExecEnvListItem({
  executionEnvironment,
  detailUrl,
}: OrganizationExecEnvListItemProps) {
  const { t } = useLingui();
  return (
    <Tr
      id={`ee-row-${executionEnvironment.id}`}
      ouiaId={`ee-row-${executionEnvironment.id}`}
    >
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
