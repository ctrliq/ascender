import type { Organization } from 'types/api';
import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { Tr, Td } from '@patternfly/react-table';

export interface UserOrganizationListItemProps {
  organization: Organization;
  [key: string]: unknown;
}

export default function UserOrganizationListItem({
  organization,
}: UserOrganizationListItemProps) {
  const { t } = useLingui();
  const labelId = `organization-${organization.id}`;
  return (
    <Tr
      id={`user-org-row-${organization.id}`}
      ouiaId={`user-org-row-${organization.id}`}
    >
      <Td id={labelId} dataLabel={t`Name`}>
        <Link to={`/organizations/${organization.id}/details`} id={labelId}>
          <b>{organization.name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Description`}>{organization.description}</Td>
    </Tr>
  );
}
