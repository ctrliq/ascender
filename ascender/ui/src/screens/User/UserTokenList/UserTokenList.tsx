import type { OAuth2Token } from 'types/api';
import React, { useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { getQSConfig, parseQueryString } from 'util/qs';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useSelected from 'hooks/useSelected';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import { UsersAPI, TokensAPI } from 'api';
import DataListToolbar from 'components/DataListToolbar';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { useConfig } from 'contexts/Config';
import { withDeleteCapability } from '../shared/canDeleteToken';
import UserTokensListItem from './UserTokenListItem';

/**
 * A token as this list holds it. The api gives a token no name, and the list
 * needs one for the delete confirmation, so the application's stands in.
 */
type NamedToken = OAuth2Token & { name?: string };

const QS_CONFIG = getQSConfig('user', {
  page: 1,
  page_size: 20,
  order_by: 'application__name',
});
function UserTokenList() {
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams() as { id: string };
  const { me, adminOrgCount } = useConfig();

  const {
    error,
    isLoading,
    request: fetchTokens,
    result: {
      tokens: readTokens,
      itemCount,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useCachedRequest(
    ['user-token-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        UsersAPI.readTokens(id, params),
        UsersAPI.readTokenOptions(id),
      ]);
      // Whether each may be deleted is worked out below, as the list renders.
      const modifiedResults: NamedToken[] = results.map((result) => ({
        ...result,
        summary_fields: {
          user: result.summary_fields.user,
          application: result.summary_fields.application,
        },
        name: result.summary_fields.application?.name as string | undefined,
      }));
      return {
        tokens: modifiedResults,
        itemCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [id, location.search]),
    { tokens: [], itemCount: 0, relatedSearchableKeys: [], searchableKeys: [] }
  );

  /*
   * Worked out as the list renders rather than inside the read, which is
   * cached by the list's address: a sign in as someone else, or a change in
   * which organizations they administer, is answered at once.
   */
  const tokens = useMemo(
    () =>
      withDeleteCapability(readTokens, me, adminOrgCount as number | undefined),
    [readTokens, me, adminOrgCount]
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(tokens);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTokens,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ id: tokenId }) => TokensAPI.destroy(tokenId))
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTokens,
    }
  );
  const handleDelete = async () => {
    await deleteTokens();
    clearSelected();
  };

  /*
   * A token is always made for the person asking for it, whoever's list they
   * are on, so Add is offered only on the viewer's own tokens.
   */
  const canAdd = me?.id !== undefined && String(me.id) === String(id);

  // A ticked token as the list now has it, so the delete button weighs the
  // capability of the current render rather than the one it was ticked under.
  const modifiedSelected = selected.map((ticked) => {
    const item = tokens.find((token) => token.id === ticked.id) ?? ticked;
    if (item.application === null) {
      return {
        ...item,
        name: t`Personal Access Token`,
      };
    }
    return item;
  });

  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || isDeleteLoading}
        items={tokens}
        itemCount={itemCount}
        pluralizedItemName={t`User Tokens`}
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchColumns={[
          {
            name: t`Application Name`,
            key: 'application__name__icontains',
            isDefault: true,
          },
          {
            name: t`Description`,
            key: 'description__icontains',
          },
        ]}
        toolbarSortColumns={[
          {
            name: t`Application Name`,
            key: 'application__name',
          },
          {
            name: t`Description`,
            key: 'description',
          },
          {
            name: t`Scope`,
            key: 'scope',
          },
          {
            name: t`Expires`,
            key: 'expires',
          },
          {
            name: t`Created`,
            key: 'created',
          },
          {
            name: t`Modified`,
            key: 'modified',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            qsConfig={QS_CONFIG}
            onSelectAll={selectAll}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      tooltip={t`Add Token`}
                      key="add"
                      linkTo={`${location.pathname}/add`}
                    />,
                  ]
                : []),
              <ToolbarDeleteButton
                ouiaId="user-token-delete-button"
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={modifiedSelected}
                pluralizedItemName={t`User Tokens`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="application__name">
              {t`Application Name`}
            </HeaderCell>
            <HeaderCell sortKey="description">{t`Description`}</HeaderCell>
            <HeaderCell sortKey="scope">{t`Scope`}</HeaderCell>
            <HeaderCell sortKey="expires">{t`Expires`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(token, index) => (
          <UserTokensListItem
            key={token.id}
            token={token}
            onSelect={() => {
              handleSelect(token);
            }}
            isSelected={selected.some((row) => row.id === token.id)}
            rowIndex={index}
          />
        )}
      />
      {Boolean(deletionError) && (
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more user tokens.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </>
  );
}

export default UserTokenList;
