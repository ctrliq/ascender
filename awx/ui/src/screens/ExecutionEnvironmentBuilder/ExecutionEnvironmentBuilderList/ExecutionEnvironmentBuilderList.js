import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { ExecutionEnvironmentBuildersAPI } from 'api';
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
import useToast from 'hooks/useToast';
import { getQSConfig, parseQueryString } from 'util/qs';

import ExecutionEnvironmentBuilderListItem from './ExecutionEnvironmentBuilderListItem';

const QS_CONFIG = getQSConfig('execution_environment_builder', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function ExecutionEnvironmentBuilderList() {
  const { t } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();
  const { addToast, Toast, toastProps } = useToast();

  const {
    result: {
      results,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    isLoading,
    request: fetchBuilders,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        ExecutionEnvironmentBuildersAPI.read(params),
        ExecutionEnvironmentBuildersAPI.readOptions(),
      ]);
      return {
        results: response.data.results,
        itemCount: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      results: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchBuilders();
  }, [fetchBuilders]);

  const { selected, isAllSelected, handleSelectAll, clearSelected, handleSelect } =
    useSelected(results);

  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: deleteBuilders,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(async () => {
      await Promise.all(
        selected.map(({ id }) => ExecutionEnvironmentBuildersAPI.destroy(id))
      );
    }, [selected]),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchBuilders,
    }
  );

  const handleDelete = async () => {
    await deleteBuilders();
    clearSelected();
  };

  const handleCopy = useCallback(
    () => {
      addToast({
        id: 'execution_environment_builder_copy_success',
        title: t`Success!`,
        variant: 'success',
        description: t`Execution Environment Builder copied successfully`,
      });
    },
    [addToast, t]
  );

  const canAdd = actions && actions.POST;
  const deleteDetailsRequests = [];

  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={null}
            hasContentLoading={isLoading || deleteLoading}
            items={results}
            itemCount={itemCount}
            pluralizedItemName={t`Execution Environment Builders`}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Image`,
                key: 'image__icontains',
              },
              {
                name: t`Tag`,
                key: 'tag__icontains',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
                <HeaderCell sortKey="image">{t`Image`}</HeaderCell>
                <HeaderCell sortKey="tag">{t`Tag`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DataListToolbar
                {...props}
                isAllSelected={isAllSelected}
                onSelectAll={handleSelectAll}
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
                    onDelete={handleDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={t`Execution Environment Builders`}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={t`These execution environment builders could be in use by other resources that rely on them. Are you sure you want to delete them anyway?`}
                  />,
                ]}
              />
            )}
            renderRow={(executionEnvironmentBuilder, index) => (
              <ExecutionEnvironmentBuilderListItem
                key={executionEnvironmentBuilder.id}
                executionEnvironmentBuilder={executionEnvironmentBuilder}
                detailUrl={`/execution_environment_builders/${executionEnvironmentBuilder.id}`}
                isSelected={selected.some(
                  (row) => row.id === executionEnvironmentBuilder.id
                )}
                onSelect={() => handleSelect(executionEnvironmentBuilder)}
                onCopy={handleCopy}
                rowIndex={index}
                fetchExecutionEnvironmentBuilders={fetchBuilders}
              />
            )}
          />
        </Card>
      </PageSection>
      <AlertModal
        aria-label={t`Deletion error`}
        isOpen={deletionError}
        onClose={clearDeletionError}
        title={t`Error`}
        variant="error"
      >
        {t`Failed to delete one or more execution environment builders`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
      <Toast {...toastProps} />
    </>
  );
}

export default ExecutionEnvironmentBuilderList;
