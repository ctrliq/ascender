import React from 'react';

import { Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';

function TeamRoleListItem({ role, detailUrl, onDisassociate }) {
  const { t } = useLingui();
  return (
    <Tr id={`role-item-row-${role.id}`} ouiaId={`role-item-row-${role.id}`}>
      <Td dataLabel={t`Resource Name`}>
        <Link to={{ pathname: `${detailUrl}` }}>
          <b>{role.summary_fields.resource_name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Type`}>
        {role.summary_fields.resource_type_display_name}
      </Td>
      <Td dataLabel={t`Role`}>
        <Label
          variant="outline"
          key={role.name}
          aria-label={role.name}
          {...(role.summary_fields.user_capabilities?.unattach
            ? { onClose: () => onDisassociate(role) }
            : {})}
        >
          {role.name}
        </Label>
      </Td>
    </Tr>
  );
}
export default TeamRoleListItem;
