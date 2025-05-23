import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Chip } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';

function UserRolesListItem({ role, detailUrl, onSelect }) {
  const { i18n } = useLingui();
  const labelId = `userRole-${role.id}`;

  return (
    <Tr id={`user-role-row-${role.id}`} ouiaId={`user-role-row-${role.id}`}>
      <Td id={labelId} dataLabel={i18n._(msg`Name`)}>
        {role.summary_fields.resource_name ? (
          <Link to={`${detailUrl}`} id={labelId}>
            <b>{role.summary_fields.resource_name}</b>
          </Link>
        ) : (
          <b>{i18n._(msg`System`)}</b>
        )}
      </Td>
      <Td dataLabel={i18n._(msg`Type`)}>
        {role.summary_fields
          ? role.summary_fields.resource_type_display_name
          : null}
      </Td>
      <Td dataLabel={i18n._(msg`Role`)}>
        {role.name ? (
          <Chip
            key={role.name}
            aria-label={role.name}
            onClick={() => onSelect(role)}
            isReadOnly={!role.summary_fields.user_capabilities.unattach}
          >
            {role.name}
          </Chip>
        ) : null}
      </Td>
    </Tr>
  );
}

export default UserRolesListItem;
