import React from 'react';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react';

import { t } from '@lingui/react/macro';
import { Tr, Td } from '@patternfly/react-table';

export default function UserOrganizationListItem({ organization }) {
  const { i18n } = useLingui();
  const labelId = `organization-${organization.id}`;
  return (
    <Tr
      id={`user-org-row-${organization.id}`}
      ouiaId={`user-org-row-${organization.id}`}
    >
      <Td id={labelId} dataLabel={i18n._(t`Name`)}>
        <Link to={`/organizations/${organization.id}/details`} id={labelId}>
          <b>{organization.name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(t`Description`)}>{organization.description}</Td>
    </Tr>
  );
}
