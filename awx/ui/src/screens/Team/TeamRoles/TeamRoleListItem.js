import React from 'react';

import { msg } from '@lingui/macro';
import { Chip } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react';

import { Link } from 'react-router-dom';

function TeamRoleListItem({ role, detailUrl, onDisassociate }) {
  const { i18n } = useLingui();
  return (
    <Tr id={`role-item-row-${role.id}`} ouiaId={`role-item-row-${role.id}`}>
      <Td dataLabel={i18n._(msg`Resource Name`)}>
        <Link to={{ pathname: `${detailUrl}` }}>
          <b>{role.summary_fields.resource_name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(msg`Type`)}>
        {role.summary_fields.resource_type_display_name}
      </Td>
      <Td dataLabel={i18n._(msg`Role`)}>
        <Chip
          key={role.name}
          aria-label={role.name}
          onClick={() => onDisassociate(role)}
          isReadOnly={!role.summary_fields.user_capabilities.unattach}
        >
          {role.name}
        </Chip>
      </Td>
    </Tr>
  );
}
export default TeamRoleListItem;
