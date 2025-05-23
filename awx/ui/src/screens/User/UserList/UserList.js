import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';

import { msg } from '@lingui/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { UsersAPI } from 'api';
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
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { getQSConfig, parseQueryString } from 'util/qs';
import { useLingui } from '@lingui/react';
import UserListItem from './UserListItem';

const QS_CONFIG = getQSConfig('user', {
  page: 1,
  page_size: 20,
  order_by: 'username',
});

function UserList() {
  const location = useLocation();
  const match = useRouteMatch();
  const { i18n } = useLingui();

  const {
    result: {
      users,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading,
    request: fetchUsers,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        UsersAPI.read(params),
        UsersAPI.readOptions(),
      ]);
      return {
        users: response.data.results,
        itemCount: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      users: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(users);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteUsers,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map((user) => UsersAPI.destroy(user.id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchUsers,
    }
  );

  const handleUserDelete = async () => {
    await deleteUsers();
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
            items={users}
            itemCount={itemCount}
            pluralizedItemName={i18n._(msg`Users`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Email`),
                key: 'email__icontains',
                isDefault: true,
              },
              {
                name: i18n._(msg`Username`),
                key: 'username__icontains',
              },
              {
                name: i18n._(msg`First Name`),
                key: 'first_name__icontains',
              },
              {
                name: i18n._(msg`Last Name`),
                key: 'last_name__icontains',
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
                    onDelete={handleUserDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(msg`Users`)}
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="username">{i18n._(msg`Username`)}</HeaderCell>
                <HeaderCell sortKey="first_name">{i18n._(msg`First Name`)}</HeaderCell>
                <HeaderCell sortKey="last_name">{i18n._(msg`Last Name`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Email`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Organization`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderRow={(user, index) => (
              <UserListItem
                key={user.id}
                user={user}
                detailUrl={`${match.url}/${user.id}/details`}
                isSelected={selected.some((row) => row.id === user.id)}
                onSelect={() => handleSelect(user)}
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
      {deletionError && (
        <AlertModal
          isOpen={deletionError}
          variant="error"
          title={msg`Error!`}
          onClose={clearDeletionError}
        >
          {msg`Failed to delete one or more users.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </>
  );
}

export default UserList;
