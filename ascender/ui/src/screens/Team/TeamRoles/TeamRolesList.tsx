import type { CurrentUser } from 'contexts/Config';
import type { Team } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { TeamsAPI, RolesAPI, UsersAPI } from 'api';
import useCachedRequest from 'hooks/useCachedRequest';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import UserAndTeamAccessAdd from 'components/UserAndTeamAccessAdd/UserAndTeamAccessAdd';
import roleResourceUrl from 'util/roles';
import {
  RoleRemovalButton,
  RoleRemovalModals,
  useRoleRemoval,
} from '../../Roles/shared/useRoleRemoval';
import TeamRoleListItem from './TeamRoleListItem';

const QS_CONFIG = getQSConfig('roles', {
  page: 1,
  page_size: 20,
  order_by: 'id',
});

export interface TeamRolesListProps {
  me: CurrentUser;
  team: Team;
}

function TeamRolesList({ me, team }: TeamRolesListProps) {
  const { t } = useLingui();
  const { search } = useLocation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [associateError, setAssociateError] = useState<unknown>(null);

  const {
    isLoading,
    request: fetchRoles,
    error: contentError,
    result: {
      roleCount,
      roles,
      isAdminOfOrg,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useCachedRequest(
    ['team-roles-list', team.id, me.id, team.organization, search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);
      const [
        {
          data: { results, count },
        },
        {
          data: { count: orgAdminCount },
        },
        actionsResponse,
      ] = await Promise.all([
        TeamsAPI.readRoles(team.id, params),
        UsersAPI.readAdminOfOrganizations(me.id as number, {
          id: team.organization,
        }),
        TeamsAPI.readRoleOptions(team.id),
      ]);
      return {
        roleCount: count,
        roles: results,
        isAdminOfOrg: orgAdminCount > 0,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [me.id, team.id, team.organization, search]),
    {
      roles: [],
      roleCount: 0,
      isAdminOfOrg: false,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const removal = useRoleRemoval({
    roles,
    qsConfig: QS_CONFIG,
    fetchRoles,
    disassociate: useCallback(
      (roleId: number) => RolesAPI.disassociateTeamRole(roleId, team.id),
      [team.id]
    ),
  });

  const canAdd = team?.summary_fields?.user_capabilities?.edit || isAdminOfOrg;

  /*
   * No System Administrator check here, unlike the user's list: the api
   * refuses to grant a team a role on nothing, so a team never holds one.
   */
  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || removal.isRemoving}
        items={roles}
        itemCount={roleCount}
        pluralizedItemName={t`Team Roles`}
        emptyContentMessage={
          canAdd
            ? t`Associate a role to list it here`
            : t`Roles this team holds appear here`
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
        renderToolbar={(props) => (
          <DataListToolbar
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
                modalTitle={t`Disassociate these roles from the team?`}
                modalNote={t`The team's members lose these roles. The resources themselves are not changed.`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell>{t`Resource Name`}</HeaderCell>
            <HeaderCell>{t`Type`}</HeaderCell>
            <HeaderCell>{t`Role`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(role, index) => (
          <TeamRoleListItem
            key={role.id}
            role={role}
            detailUrl={roleResourceUrl(role)}
            onDisassociate={removal.setRoleToDisassociate}
            isSelected={removal.selected.some((row) => row.id === role.id)}
            onSelectRow={() => removal.handleSelect(role)}
            rowIndex={index}
          />
        )}
      />
      {showAddModal && (
        <UserAndTeamAccessAdd
          apiModel={TeamsAPI}
          resourceId={team.id}
          onFetchData={() => {
            setShowAddModal(false);
            fetchRoles();
          }}
          title={t`Associate Team Roles`}
          onClose={() => setShowAddModal(false)}
          onError={(err) => setAssociateError(err)}
        />
      )}
      <RoleRemovalModals
        removal={removal}
        confirmMessage={t`This disassociates the following role from the team:`}
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
export default TeamRolesList;
