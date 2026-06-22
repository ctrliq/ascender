import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

function OrganizationExecEnvListItem({ executionEnvironment, detailUrl }) {
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
