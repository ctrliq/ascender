import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { useParams, useLocation } from 'react-router-dom';
import PaginatedTable, { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import { TokensAPI, ApplicationsAPI } from 'api';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import DatalistToolbar from 'components/DataListToolbar';
import ApplicationTokenListItem from './ApplicationTokenListItem';

const QS_CONFIG = getQSConfig('applications', {
  page: 1,
  page_size: 20,
  order_by: 'user__username',
});

function ApplicationTokenList() {
  const { i18n } = useLingui();
  const { id } = useParams();
  const location = useLocation();
  const {
    error,
    isLoading,
    result: { tokens, itemCount, relatedSearchableKeys, searchableKeys },
    request: fetchTokens,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        ApplicationsAPI.readTokens(id, params),
        ApplicationsAPI.readTokenOptions(id),
      ]);
      const modifiedResults = results.map((result) => {
        result.summary_fields = {
          user: result.summary_fields.user,
          application: result.summary_fields.application,
          user_capabilities: { delete: true },
        };
        result.name = result.summary_fields.user?.username;
        return result;
      });
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

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(tokens);
  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: handleDeleteApplications,
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
    await handleDeleteApplications();
    clearSelected();
  };

  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || deleteLoading}
        items={tokens}
        itemCount={itemCount}
        pluralizedItemName={i18n._(t`Tokens`)}
        qsConfig={QS_CONFIG}
        toolbarSearchColumns={[
          {
            name: i18n._(t`Name`),
            key: 'user__username__icontains',
            isDefault: true,
          },
        ]}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DatalistToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            deleteButtonText={i18n._(t`Delete selected tokens`)}
            onDelete={handleDelete}
            isDeleteDisabled={!selected.length}
          />
        )}
        renderRow={(token) => (
          <ApplicationTokenListItem
            key={token.id}
            token={token}
            isSelected={selected.some((row) => row.id === token.id)}
            onSelect={() => handleSelect(token)}
            detailUrl={`/applications/${id}/tokens/${token.id}/details`}
            rowIndex={tokens.findIndex((to) => to.id === token.id)}
          />
        )}
      />
      <AlertModal
        isOpen={Boolean(deletionError)}
        variant="danger"
        title={i18n._(t`Error deleting tokens`)}
        onClose={clearDeletionError}
      >
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default ApplicationTokenList;
