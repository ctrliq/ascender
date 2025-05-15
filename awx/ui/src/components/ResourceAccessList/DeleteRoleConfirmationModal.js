/* eslint-disable react/jsx-no-useless-fragment */
import React from 'react';
import { func, string } from 'prop-types';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Role } from 'types';
import AlertModal from '../AlertModal';

function DeleteRoleConfirmationModal({ role, username, onCancel, onConfirm }) {
  const { i18n } = useLingui();
  const sourceOfRole = () =>
    typeof role.team_id !== 'undefined' ? i18n._(msg`Team`) : i18n._(msg`User`);
  const title = i18n._(msg`Remove ${sourceOfRole()} Access`);
  return (
    <AlertModal
      variant="danger"
      title={title}
      isOpen
      onClose={onCancel}
      actions={[
        <Button
          ouiaId="delete-role-modal-delete-button"
          key="delete"
          variant="danger"
          aria-label={i18n._(msg`Confirm delete`)}
          onClick={onConfirm}
        >
          {i18n._(msg`Delete`)}
        </Button>,
        <Button
          ouiaId="delete-role-modal-cancel-button"
          key="cancel"
          variant="link"
          onClick={onCancel}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      {sourceOfRole() === 'Team' ? (
        <>
          {i18n._(msg`Are you sure you want to remove ${role.name} access from ${role.team_name}?  Doing so affects all members of the team.`)}
          <br />
          <br />
          {i18n._(msg`If you only want to remove access for this particular user, please remove them from the team.`)}
        </>
      ) : (
        <>
          {i18n._(msg`Are you sure you want to remove ${role.name} access from ${username}?`)}
        </>
      )}
    </AlertModal>
  );
}

DeleteRoleConfirmationModal.propTypes = {
  role: Role.isRequired,
  username: string,
  onCancel: func.isRequired,
  onConfirm: func.isRequired,
};

DeleteRoleConfirmationModal.defaultProps = {
  username: '',
};

export default DeleteRoleConfirmationModal;
