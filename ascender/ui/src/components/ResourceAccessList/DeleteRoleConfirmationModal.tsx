import React from 'react';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import type { AccessRole } from './ResourceAccessListItem';

import AlertModal from '../AlertModal';

export interface DeleteRoleConfirmationModalProps {
  role: AccessRole;
  username?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  [key: string]: unknown;
}

function DeleteRoleConfirmationModal({
  role,
  username = '',
  onCancel,
  onConfirm,
}: DeleteRoleConfirmationModalProps) {
  const { t } = useLingui();
  const isTeamRole = typeof role.team_id !== 'undefined';
  const title = isTeamRole
    ? t`Disassociate Team Role`
    : t`Disassociate User Role`;
  return (
    <AlertModal
      variant="warning"
      title={title}
      isOpen
      onClose={onCancel}
      actions={[
        <Button
          ouiaId="delete-role-modal-delete-button"
          key="disassociate"
          variant="danger"
          aria-label={t`Confirm Disassociate`}
          onClick={onConfirm}
        >
          {t`Disassociate`}
        </Button>,
        <Button
          ouiaId="delete-role-modal-cancel-button"
          key="cancel"
          variant="link"
          onClick={onCancel}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      {isTeamRole ? (
        <>
          {t`Are you sure you want to disassociate the ${role.name} role from ${role.team_name}? Doing so affects all members of the team.`}
          <br />
          <br />
          {t`If you only want to remove access for this particular user, disassociate them from the team instead.`}
        </>
      ) : (
        <>
          {t`Are you sure you want to disassociate the ${role.name} role from ${username}?`}
        </>
      )}
    </AlertModal>
  );
}

export default DeleteRoleConfirmationModal;
