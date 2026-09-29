import type { SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { OrganizationsAPI, TeamsAPI } from 'api';
import AlertModal from 'components/AlertModal';
import DataListToolbar from 'components/DataListToolbar';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import OrganizationTeamListItem from './OrganizationTeamListItem';

const QS_CONFIG = getQSConfig('team', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface OrganizationTeamListProps {
  id: number | string;
  /** The organization itself, which a team added from here belongs to. */
  organization?: SummaryFieldRef | null;
  [key: string]: unknown;
}

function OrganizationTeamList({
  id,
  organization = null,
}: OrganizationTeamListProps) {
  const { t } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    result: { teams, count, relatedSearchableKeys, searchableKeys, canAdd },
    error,
    isLoading,
    request: fetchTeams,
  } = useCachedRequest(
    ['organization-team-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        OrganizationsAPI.readTeams(id, params),
        OrganizationsAPI.readTeamsOptions(id),
      ]);
      return {
        teams: response.data.results,
        count: response.data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        // The organization's own teams endpoint offers POST to whoever may add
        // a team to it, which is who the Add button is for.
        canAdd: Boolean(actionsResponse.data.actions?.POST),
      };
    }, [id, location]),
    {
      teams: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
      canAdd: false,
    }
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(teams);

  /*
   * A team belongs to exactly one organization, so taking it off this tab
   * means deleting it, as the Teams list does. The rows carry their own
   * delete capability, which the button reads to refuse a team the viewer
   * may not delete.
   */
  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTeams,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map((team) => TeamsAPI.destroy(team.id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTeams,
    }
  );

  const handleTeamDelete = async () => {
    await deleteTeams();
    clearSelected();
  };

  /*
   * A team added from here belongs to this organization, so the form opens
   * with it filled in and Cancel comes back to this tab. The team form is the
   * one the Teams screen uses; it is handed the organization rather than made
   * a second time.
   */
  const addTeam = () =>
    navigate('/teams/add', {
      state: organization ? { organization } : undefined,
    });
  const addButton = (
    <ToolbarAddButton key="add" tooltip={t`Add Team`} onClick={addTeam} />
  );

  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || isDeleteLoading}
        items={teams}
        itemCount={count}
        pluralizedItemName={t`Teams`}
        emptyContentMessage={t`Teams created in this organization appear here`}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd ? [addButton] : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleTeamDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Teams`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Actions`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(item, index) => (
          <OrganizationTeamListItem
            key={item.id}
            value={item.name}
            team={item}
            detailUrl={`/teams/${item.id}`}
            isSelected={selected.some((row) => row.id === item.id)}
            onSelect={() => handleSelect(item)}
            rowIndex={index}
          />
        )}
      />
      <AlertModal
        isOpen={Boolean(deletionError)}
        variant="error"
        title={t`Error!`}
        onClose={clearDeletionError}
      >
        {t`Failed to delete one or more teams.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export { OrganizationTeamList as _OrganizationTeamList };
export default OrganizationTeamList;
