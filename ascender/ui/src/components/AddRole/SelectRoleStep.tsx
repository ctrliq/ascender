import type { ApiEntity, SummaryFieldRef } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import CheckboxCard from './CheckboxCard';
import { SelectedList } from '../SelectedList';

/** One role a resource offers, as its own summary field names it. */
export type SelectableRole = SummaryFieldRef & { user_only?: boolean };

export interface RolesStepProps {
  onRolesClick?: (role: SelectableRole) => void;
  /** The roles on offer, keyed by the role's own name. */
  roles: Record<string, SelectableRole>;
  /** Which field of a selected row to show as its label. */
  selectedListKey?: string;
  selectedListLabel?: string;
  selectedResourceRows?: ApiEntity[];
  selectedRoleRows?: SelectableRole[];
}

function RolesStep({
  onRolesClick = () => {},
  roles,
  selectedListKey = 'name',
  selectedListLabel,
  selectedResourceRows = [],
  selectedRoleRows = [],
}: RolesStepProps) {
  const { t } = useLingui();

  return (
    <>
      <div>
        {t`Choose roles to apply to the selected resources.  Note that all selected roles will be applied to all selected resources.`}
      </div>
      <div>
        {selectedResourceRows.length > 0 && (
          <SelectedList
            displayKey={selectedListKey}
            isReadOnly
            label={selectedListLabel || t`Selected`}
            selected={selectedResourceRows}
          />
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px 20px',
          marginTop: '20px',
        }}
      >
        {Object.entries(roles).map(([key, role]) => (
          <CheckboxCard
            description={role.description}
            itemId={role.id}
            isSelected={selectedRoleRows.some((item) => item.id === role.id)}
            key={key}
            name={role.name ?? ''}
            onSelect={() => onRolesClick(role)}
          />
        ))}
      </div>
    </>
  );
}

export default RolesStep;
