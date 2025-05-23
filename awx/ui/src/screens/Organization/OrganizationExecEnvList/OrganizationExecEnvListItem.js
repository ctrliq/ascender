import React from 'react';
import { string } from 'prop-types';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

import { ExecutionEnvironment } from 'types';

function OrganizationExecEnvListItem({ executionEnvironment, detailUrl }) {
  const { i18n } = useLingui();
  return (
    <Tr
      id={`ee-row-${executionEnvironment.id}`}
      ouiaId={`ee-row-${executionEnvironment.id}`}
    >
      <Td dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{executionEnvironment.name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(msg`Image`)}>{executionEnvironment.image}</Td>
    </Tr>
  );
}

OrganizationExecEnvListItem.prototype = {
  executionEnvironment: ExecutionEnvironment.isRequired,
  detailUrl: string.isRequired,
};

export default OrganizationExecEnvListItem;
