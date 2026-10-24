import type { SummaryFieldRef, Team } from 'types/api';
import React, { useState, useCallback, useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import DataListToolbar from 'components/DataListToolbar';
import DisassociateButton from 'components/DisassociateButton';
import AssociateModal from 'components/AssociateModal';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { TeamsAPI, UsersAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { getQSConfig, parseQueryString } from 'util/qs';

import type { QSParams } from 'util/qs';
import { membershipPickerParams } from '../shared/membership';
import UserTeamListItem from './UserTeamListItem';

const QS_CONFIG = getQSConfig('teams', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function UserTeamList() {
  const { t } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const location = useLocation();
  const { id: userId } = useParams() as { id: string };
  const { me, adminOrgCount } = useConfig();

  const {
    result: { teams, count, relatedSearchableKeys, searchableKeys },
    error: contentError,
    isLoading,
    request: fetchTeams,
  } = useCachedRequest(
    ['user-team-list', userId, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count: teamCount },
        },
        actionsResponse,
      ] = await Promise.all([
        UsersAPI.readTeams(userId, params),
        UsersAPI.readTeamsOptions(userId),
      ]);
      return {
        teams: results,
        count: teamCount,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [userId, location.search]),
    {
      teams: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(teams);

  const disassociateUserRoles = (team: Team) => [
    UsersAPI.disassociateRole(
      userId,
      (team.summary_fields.object_roles as Record<string, SummaryFieldRef>)
        ?.admin_role?.id as number
    ),
    UsersAPI.disassociateRole(
      userId,
      (team.summary_fields.object_roles as Record<string, SummaryFieldRef>)
        ?.member_role?.id as number
    ),
    UsersAPI.disassociateRole(
      userId,
      (team.summary_fields.object_roles as Record<string, SummaryFieldRef>)
        ?.read_role?.id as number
    ),
  ];

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateTeams,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(selected.flatMap((team) => disassociateUserRoles(team))),
      /* eslint-disable-next-line react-hooks/exhaustive-deps */
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTeams,
    }
  );

  const { request: handleAssociate, error: associateError } = useRequest(
    useCallback(
      async (teamsToAssociate: Team[]) => {
        await Promise.all(
          teamsToAssociate.map((team) =>
            UsersAPI.associateRole(
              userId,
              (
                team.summary_fields.object_roles as Record<
                  string,
                  SummaryFieldRef
                >
              )?.member_role?.id as number
            )
          )
        );
        fetchTeams();
      },
      [userId, fetchTeams]
    )
  );

  const handleDisassociate = async () => {
    await disassociateTeams();
    clearSelected();
  };

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  /*
   * Membership is the team's Member role, which the api lets a superuser, an
   * admin of the team's organization or an admin of the team itself grant.
   * Whether the viewer may create users, which the users endpoint's OPTIONS
   * answers, is a different question. Whether the viewer runs a team is asked
   * only when neither of the first two already settles it.
   */
  const isOrgLevel = Boolean(me?.is_superuser) || Boolean(adminOrgCount);
  const { result: adminTeamCount, request: fetchAdminTeamCount } = useRequest(
    useCallback(async () => {
      const {
        data: { count: teamsAdministered },
      } = await TeamsAPI.read({ role_level: 'admin_role', page_size: 1 });
      return teamsAdministered;
    }, []),
    0
  );
  useEffect(() => {
    if (!isOrgLevel) {
      fetchAdminTeamCount();
    }
  }, [isOrgLevel, fetchAdminTeamCount]);
  const canAdd = isOrgLevel || adminTeamCount > 0;

  const fetchTeamsToAssociate = useCallback(
    (params: QSParams) =>
      TeamsAPI.read(
        membershipPickerParams(params, {
          not__member_role__members__id: userId,
          not__admin_role__members__id: userId,
        })
      ),
    [userId]
  );

  const readTeamOptions = useCallback(
    () => UsersAPI.readTeamsOptions(userId),
    [userId]
  );

  return (
    <>
      <PaginatedTable
        items={teams}
        contentError={contentError}
        hasContentLoading={isLoading || isDisassociateLoading}
        itemCount={count}
        pluralizedItemName={t`Teams`}
        emptyContentMessage={
          canAdd
            ? t`Associate the user with a team to list it here`
            : t`Teams this user belongs to appear here`
        }
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Organization`}</HeaderCell>
            <HeaderCell>{t`Description`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(team, index) => (
          <UserTeamListItem
            key={team.id}
            value={team.name}
            team={team}
            detailUrl={`/teams/${team.id}/details`}
            onSelect={() => handleSelect(team)}
            isSelected={selected.some((row) => row.id === team.id)}
            rowIndex={index}
          />
        )}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Team`}
                      key="associate"
                      onClick={() => setIsModalOpen(true)}
                    />,
                  ]
                : []),
              <DisassociateButton
                key="disassociate"
                onDisassociate={handleDisassociate}
                itemsToDisassociate={selected}
                modalTitle={t`Disassociate the user from these teams?`}
                modalNote={t`This removes all of the user's roles in the selected teams. The teams themselves are not deleted.`}
              />,
            ]}
          />
        )}
        // On the table, which hands it to the list header: the toolbar has
        // no such prop, and given to it this was dropped.
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Organization`,
            key: 'organization__name__icontains',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Teams`}
          fetchRequest={fetchTeamsToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Teams`}
          optionsRequest={readTeamOptions}
        />
      )}
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {associateError
            ? t`Failed to associate one or more teams.`
            : t`Failed to disassociate one or more teams.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default UserTeamList;
