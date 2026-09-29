import type { Role } from 'types/api';
import React from 'react';

import { Label } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';

export interface TeamRoleListItemProps {
  role: Role;
  detailUrl: string | null;
  onDisassociate: (role: Role) => void;
  /** Whether the row is ticked for the toolbar's Delete, and the tick. */
  isSelected?: boolean;
  onSelectRow?: () => void;
  rowIndex?: number;
}

function TeamRoleListItem({
  role,
  detailUrl,
  onDisassociate,
  isSelected = false,
  onSelectRow,
  rowIndex,
}: TeamRoleListItemProps) {
  const { t } = useLingui();
  return (
    <Tr id={`role-item-row-${role.id}`} ouiaId={`role-item-row-${role.id}`}>
      <Td
        select={{
          rowIndex: rowIndex ?? 0,
          isSelected: Boolean(isSelected),
          onSelect: () => onSelectRow?.(),
          // Only a role the api lets this viewer take off can be ticked.
          isDisabled: !role.summary_fields.user_capabilities?.unattach,
        }}
        dataLabel={t`Selected`}
      />
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
          closeBtnAriaLabel={t`Disassociate ${role.name}`}
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
