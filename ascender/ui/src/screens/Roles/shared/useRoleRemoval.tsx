import type { Role } from 'types/api';
import type { QSConfig } from 'util/qs';
import React, { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import AlertModal from 'components/AlertModal';
import DisassociateButton from 'components/DisassociateButton';
import ErrorDetail from 'components/ErrorDetail';

/**
 * A role as the list names it: with the resource it is on, since "Admin" alone
 * says nothing when a list holds five of them, and "System" for a role on
 * nothing.
 *
 * Args:
 *   role: The role to name.
 *   system: What a role on no resource is called, in the viewer's language.
 *
 * Returns:
 *   The resource's name and the role's, as one label.
 */
export function roleLabel(role: Role, system: string): string {
  return `${role.summary_fields.resource_name ?? system}: ${role.name}`;
}

interface UseRoleRemovalOptions {
  /** The roles on the page, as the list read them. */
  roles: Role[];
  /** The list's paging, which a removal that empties a page steps back. */
  qsConfig: QSConfig;
  /** Reads the list again once roles have been taken off. */
  fetchRoles: () => void;
  /** Takes one role off whoever holds it. */
  disassociate: (roleId: number) => Promise<unknown>;
}

/**
 * Taking roles off a user or a team, one from its row or several at once.
 *
 * The user's and the team's role lists take roles off the same way: a row's
 * chip asks about one role, the toolbar's Disassociate takes off every ticked
 * one, only a role the api lets the viewer unattach can be ticked, and taking
 * off every role on a page past the first steps back a page. What differs is
 * who holds the roles, which the caller's disassociate answers.
 *
 * Args:
 *   options: The page's roles, its paging, how to read it again, and how to
 *     take one role off.
 *
 * Returns:
 *   The ticked roles and their handlers, the role a row asked about, whether
 *   a removal is in flight, and what the toolbar and the modals need.
 */
export function useRoleRemoval({
  roles,
  qsConfig,
  fetchRoles,
  disassociate,
}: UseRoleRemovalOptions) {
  const { t } = useLingui();
  const [roleToDisassociate, setRoleToDisassociate] = useState<Role | null>(
    null
  );

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateRole,
    deletionError: disassociationError,
    clearDeletionError: clearDisassociationError,
  } = useDeleteItems(
    useCallback(async () => {
      setRoleToDisassociate(null);
      if (roleToDisassociate) {
        await disassociate(roleToDisassociate.id);
      }
    }, [roleToDisassociate, disassociate]),
    {
      qsConfig,
      // Taking off the last role on a page past the first steps back a page
      // rather than leaving an empty one behind.
      allItemsSelected: roles.length === 1,
      fetchItems: fetchRoles,
    }
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected<Role>(
      roles.filter((role: Role) =>
        Boolean(role.summary_fields.user_capabilities?.unattach)
      )
    );
  const {
    isLoading: isBulkRemoveLoading,
    deleteItems: removeSelectedRoles,
    deletionError: bulkRemoveError,
    clearDeletionError: clearBulkRemoveError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map((role) => disassociate(role.id))),
      [selected, disassociate]
    ),
    {
      qsConfig,
      /*
       * Compared with every row on the page rather than isAllSelected, which
       * only counts the roles this viewer may take off: the page is empty
       * afterwards only when every row on it was ticked.
       */
      allItemsSelected: selected.length > 0 && selected.length === roles.length,
      fetchItems: fetchRoles,
    }
  );
  const removeSelected = async () => {
    await removeSelectedRoles();
    clearSelected();
  };
  const selectedToRemove = selected.map((role) => ({
    ...role,
    name: roleLabel(role, t`System`),
  }));

  return {
    selected,
    isAllSelected,
    handleSelect,
    selectAll,
    clearSelected,
    selectedToRemove,
    removeSelected,
    roleToDisassociate,
    setRoleToDisassociate,
    disassociateRole,
    isRemoving: isDisassociateLoading || isBulkRemoveLoading,
    bulkRemoveError,
    clearBulkRemoveError,
    disassociationError,
    clearDisassociationError,
  };
}

export type RoleRemoval = ReturnType<typeof useRoleRemoval>;

interface RoleRemovalButtonProps {
  removal: RoleRemoval;
  /** Asks whether to take the ticked roles off. */
  modalTitle: string;
  /** What taking them off does, and what it leaves alone. */
  modalNote: string;
}

/**
 * The toolbar's Disassociate, which takes the ticked roles off the same way
 * the chip on a row takes off one.
 */
export function RoleRemovalButton({
  removal,
  modalTitle,
  modalNote,
}: RoleRemovalButtonProps) {
  return (
    <DisassociateButton
      onDisassociate={removal.removeSelected}
      itemsToDisassociate={removal.selectedToRemove}
      // Only roles the api lets this viewer take off can be ticked.
      verifyCannotDisassociate={false}
      modalTitle={modalTitle}
      modalNote={modalNote}
    />
  );
}

interface RoleRemovalModalsProps {
  removal: RoleRemoval;
  /** Introduces the one role a row asked about, naming who holds it. */
  confirmMessage: string;
}

/**
 * The confirmation a row's chip opens, and the errors either way of taking a
 * role off can end in.
 */
export function RoleRemovalModals({
  removal,
  confirmMessage,
}: RoleRemovalModalsProps) {
  const { t } = useLingui();
  const {
    roleToDisassociate,
    setRoleToDisassociate,
    disassociateRole,
    bulkRemoveError,
    clearBulkRemoveError,
    disassociationError,
    clearDisassociationError,
  } = removal;
  return (
    <>
      {roleToDisassociate && (
        <AlertModal
          aria-label={t`Disassociate role`}
          isOpen={Boolean(roleToDisassociate)}
          variant="warning"
          title={t`Disassociate Role?`}
          onClose={() => setRoleToDisassociate(null)}
          actions={[
            <Button
              ouiaId="disassociate-confirm-button"
              key="disassociate"
              variant="danger"
              aria-label={t`Confirm Disassociate`}
              onClick={() => disassociateRole()}
            >
              {t`Disassociate`}
            </Button>,
            <Button
              ouiaId="disassociate-cancel-button"
              key="cancel"
              variant="link"
              aria-label={t`Cancel`}
              onClick={() => setRoleToDisassociate(null)}
            >
              {t`Cancel`}
            </Button>,
          ]}
        >
          <div>
            {confirmMessage}
            <br />
            <strong>{roleLabel(roleToDisassociate, t`System`)}</strong>
          </div>
        </AlertModal>
      )}
      {Boolean(bulkRemoveError) && (
        <AlertModal
          isOpen={Boolean(bulkRemoveError)}
          variant="error"
          title={t`Error!`}
          onClose={clearBulkRemoveError}
        >
          {t`Failed to disassociate one or more roles.`}
          <ErrorDetail error={bulkRemoveError} />
        </AlertModal>
      )}
      {Boolean(disassociationError) && (
        <AlertModal
          isOpen={Boolean(disassociationError)}
          variant="error"
          title={t`Error!`}
          onClose={clearDisassociationError}
        >
          {t`Failed to disassociate role.`}
          <ErrorDetail error={disassociationError} />
        </AlertModal>
      )}
    </>
  );
}
