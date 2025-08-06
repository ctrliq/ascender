import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';

import { t } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { TeamsAPI } from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
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
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString } from 'util/qs';

import TeamListItem from './TeamListItem';

const QS_CONFIG = getQSConfig('team', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function TeamList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();

  const {
    result: {
      teams,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchTeams,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        TeamsAPI.read(params),
        TeamsAPI.readOptions(),
      ]);
      return {
        teams: response.data.results,
        itemCount: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      teams: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(teams);

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

  const hasContentLoading = isDeleteLoading || isLoading;
  const canAdd = actions && actions.POST;

  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={hasContentLoading}
            items={teams}
            itemCount={itemCount}
            pluralizedItemName={i18n._(t`Teams`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: i18n._(t`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: i18n._(t`Description`),
                key: 'description__icontains',
              },
              {
                name: i18n._(t`Organization Name`),
                key: 'organization__name__icontains',
              },
              {
                name: i18n._(t`Created By (Username)`),
                key: 'created_by__username__icontains',
              },
              {
                name: i18n._(t`Modified By (Username)`),
                key: 'modified_by__username__icontains',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(t`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(t`Organization`)}</HeaderCell>
                <HeaderCell>{i18n._(t`Actions`)}</HeaderCell>
              </HeaderRow>
            }
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
                          key="add"
                          linkTo={`${match.url}/add`}
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleTeamDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(t`Teams`)}
                  />,
                ]}
              />
            )}
            renderRow={(team, index) => (
              <TeamListItem
                key={team.id}
                team={team}
                detailUrl={`${match.url}/${team.id}`}
                isSelected={selected.some((row) => row.id === team.id)}
                onSelect={() => handleSelect(team)}
                rowIndex={index}
              />
            )}
            emptyStateControls={
              canAdd ? (
                <ToolbarAddButton key="add" linkTo={`${match.url}/add`} />
              ) : null
            }
          />
        </Card>
      </PageSection>
      <AlertModal
        isOpen={deletionError}
        variant="error"
        title={i18n._(t`Error!`)}
        onClose={clearDeletionError}
      >
        {i18n._(t`Failed to delete one or more teams.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default TeamList;
