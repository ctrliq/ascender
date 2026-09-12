import type { Role } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';

export interface UserRolesListItemProps {
  role: Role;
  detailUrl?: string | null;
  /** Takes the role off the user, which the list confirms before it does. */
  onSelect: (role: Role) => void;
  [key: string]: unknown;
}

function UserRolesListItem({
  role,
  detailUrl,
  onSelect,
}: UserRolesListItemProps) {
  const { t } = useLingui();
  const labelId = `userRole-${role.id}`;

  return (
    <Tr id={`user-role-row-${role.id}`} ouiaId={`user-role-row-${role.id}`}>
      <Td id={labelId} dataLabel={t`Name`}>
        {role.summary_fields.resource_name ? (
          <Link to={`${detailUrl}`} id={labelId}>
            <b>{role.summary_fields.resource_name}</b>
          </Link>
        ) : (
          <b>{t`System`}</b>
        )}
      </Td>
      <Td dataLabel={t`Type`}>
        {role.summary_fields
          ? role.summary_fields.resource_type_display_name
          : null}
      </Td>
      <Td dataLabel={t`Role`}>
        {role.name ? (
          <Label
            variant="outline"
            key={role.name}
            aria-label={role.name}
            {...(role.summary_fields.user_capabilities?.unattach
              ? { onClose: () => onSelect(role) }
              : {})}
          >
            {role.name}
          </Label>
        ) : null}
      </Td>
    </Tr>
  );
}

export default UserRolesListItem;
