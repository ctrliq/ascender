import type { Role, User } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import roleResourceUrl from 'util/roles';
import { getQSConfig, parseQueryString } from 'util/qs';
import { UsersAPI, RolesAPI } from 'api';
import useCachedRequest from 'hooks/useCachedRequest';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import UserAndTeamAccessAdd from 'components/UserAndTeamAccessAdd/UserAndTeamAccessAdd';
import {
  RoleRemovalButton,
  RoleRemovalModals,
  useRoleRemoval,
} from '../../Roles/shared/useRoleRemoval';
import UserRolesListItem from './UserRolesListItem';

const QS_CONFIG = getQSConfig('roles', {
  page: 1,
  page_size: 20,
  order_by: 'id',
});
// TODO Figure out how to best conduct a search of this list.
// Since we only have a role ID in the top level of each role object
// we can't really search using the normal search parameters.
export interface UserRolesListProps {
  user: User;
  [key: string]: unknown;
}

function UserRolesList({ user }: UserRolesListProps) {
  const { t } = useLingui();
  const { search } = useLocation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [associateError, setAssociateError] = useState<unknown>(null);

  const {
    isLoading,
    request: fetchRoles,
    error,
    result: {
      roleCount,
      roles,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useCachedRequest(
    ['user-roles-list', user.id, search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);
      const [
        {
          data: { results, count },
        },
        actionsResponse,
        roleOptionsResponse,
      ] = await Promise.all([
        UsersAPI.readRoles(user.id, params),
        UsersAPI.readOptions(),
        UsersAPI.readRoleOptions(user.id),
      ]);
      /*
       * Associate stays gated on the users endpoint as before, while the search
       * keys come from the roles endpoint this list reads, since the fields a
       * user has are not the fields a role can be searched by.
       */
      return {
        roleCount: count,
        roles: results,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          roleOptionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(
          roleOptionsResponse?.data?.actions?.GET
        ),
      };
    }, [user.id, search]),
    {
      roles: [],
      roleCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const removal = useRoleRemoval({
    roles,
    qsConfig: QS_CONFIG,
    fetchRoles,
    disassociate: useCallback(
      (roleId: number) => RolesAPI.disassociateUserRole(roleId, user.id),
      [user.id]
    ),
  });

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  /*
   * A superuser holds every role there is, so the list of the ones granted
   * says nothing about what they can do. Read off the account rather than off
   * a role's name, which the api translates into the viewer's language, and
   * which is on the current page only when it happens to sort there.
   */
  if (user.is_superuser) {
    return (
      <EmptyState
        headingLevel="h5"
        icon={CubesIcon}
        titleText={<>{t`System Administrator`}</>}
        variant="full"
      >
        <EmptyStateBody>
          {t`System administrators have unrestricted access to all resources`}
        </EmptyStateBody>
      </EmptyState>
    );
  }
  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || removal.isRemoving}
        items={roles}
        itemCount={roleCount}
        pluralizedItemName={t`User Roles`}
        emptyContentMessage={
          canAdd
            ? t`Associate a role to list it here`
            : t`Roles this user holds appear here`
        }
        qsConfig={QS_CONFIG}
        clearSelected={removal.clearSelected}
        toolbarSearchColumns={[
          {
            name: t`Role`,
            key: 'role_field__icontains',
            isDefault: true,
          },
        ]}
        toolbarSortColumns={[
          {
            name: t`ID`,
            key: 'id',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell>{t`Resource Name`}</HeaderCell>
            <HeaderCell>{t`Type`}</HeaderCell>
            <HeaderCell>{t`Role`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(role: Role, index: number) => (
          <UserRolesListItem
            key={role.id}
            value={role.name}
            role={role}
            detailUrl={roleResourceUrl(role)}
            onSelect={(item) => {
              removal.setRoleToDisassociate(item);
            }}
            isSelected={removal.selected.some((row) => row.id === role.id)}
            onSelectRow={() => removal.handleSelect(role)}
            rowIndex={index}
          />
        )}
        renderToolbar={(props) => (
          <DatalistToolbar
            {...props}
            isAllSelected={removal.isAllSelected}
            onSelectAll={removal.selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Role`}
                      ouiaId="role-add-button"
                      key="add"
                      onClick={() => setShowAddModal(true)}
                    />,
                  ]
                : []),
              <RoleRemovalButton
                key="disassociate"
                removal={removal}
                modalTitle={t`Disassociate these roles from the user?`}
                modalNote={t`The user loses these roles. The resources themselves are not changed.`}
              />,
            ]}
          />
        )}
      />
      {showAddModal && (
        <UserAndTeamAccessAdd
          apiModel={UsersAPI}
          resourceId={user.id}
          onFetchData={() => {
            setShowAddModal(false);
            fetchRoles();
          }}
          title={t`Associate User Roles`}
          onClose={() => setShowAddModal(false)}
          onError={(err) => setAssociateError(err)}
        />
      )}
      <RoleRemovalModals
        removal={removal}
        confirmMessage={t`This disassociates the following role from the user:`}
      />
      {associateError && (
        <AlertModal
          aria-label={t`Associate role error`}
          isOpen={associateError}
          variant="error"
          title={t`Error!`}
          onClose={() => setAssociateError(null)}
        >
          {t`Failed to associate one or more roles. Some roles may have been associated; the list now shows which.`}
          <ErrorDetail error={associateError} />
        </AlertModal>
      )}
    </>
  );
}
export default UserRolesList;
