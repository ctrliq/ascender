import React, { useCallback } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import useToast, { AlertVariant } from 'hooks/useToast';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarDeleteButton,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import ExecutionEnvironmentBuilderListItem from './ExecutionEnvironmentBuilderListItem';

const QS_CONFIG = getQSConfig('execution_environment_builders', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function ExecutionEnvironmentBuilderList() {
  const { t } = useLingui();
  const location = useLocation();
  const { addToast, Toast, toastProps } = useToast();

  const {
    error: contentError,
    isLoading,
    request: fetchBuilders,
    result: {
      builders,
      buildersCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useCachedRequest(
    ['execution-environment-builder-list', location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, responseActions] = await Promise.all([
        ExecutionEnvironmentBuildersAPI.read(params),
        ExecutionEnvironmentBuildersAPI.readOptions(),
      ]);
      return {
        builders: response.data.results,
        buildersCount: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location]),
    {
      builders: [],
      buildersCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(builders);

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

  const handleCopy = useCallback(
    (newId: number) => {
      addToast({
        id: newId,
        title: t`Execution environment builder copied successfully`,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, t]
  );

  const handleDelete = async () => {
    await deleteBuilders();
    clearSelected();
  };

  const canAdd = actions && actions.POST;
  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <PaginatedTable
            ouiaId="execution-environment-builder-table"
            contentError={contentError}
            hasContentLoading={isLoading || deleteLoading}
            items={builders}
            itemCount={buildersCount}
            pluralizedItemName={t`Execution Environment Builders`}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
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
                name: t`Project`,
                key: 'project__name__icontains',
              },
            ]}
            toolbarSortColumns={[
              {
                name: t`Image`,
                key: 'image',
              },
              {
                name: t`Created`,
                key: 'created',
              },
              {
                name: t`Organization`,
                key: 'organization',
              },
            ]}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
                <HeaderCell>{t`Image`}</HeaderCell>
                <HeaderCell>{t`Project`}</HeaderCell>
                <HeaderCell>{t`Organization`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DatalistToolbar
                {...props}
                isAllSelected={isAllSelected}
                onSelectAll={selectAll}
                qsConfig={QS_CONFIG}
                additionalControls={[
                  ...(canAdd
                    ? [
                        <ToolbarAddButton
                          ouiaId="add-execution-environment-builder"
                          key="add"
                          linkTo="/execution_environment_builders/add"
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={t`Execution Environment Builders`}
                    deleteMessage={t`Deleting a builder also deletes all of its builds. Are you sure you want to delete it?`}
                  />,
                ]}
              />
            )}
            renderRow={(builder, index) => (
              <ExecutionEnvironmentBuilderListItem
                key={builder.id}
                rowIndex={index}
                executionEnvironmentBuilder={builder}
                detailUrl={`/execution_environment_builders/${builder.id}/details`}
                onSelect={() => handleSelect(builder)}
                onCopy={handleCopy}
                isSelected={selected.some((row) => row.id === builder.id)}
                fetchExecutionEnvironmentBuilders={fetchBuilders}
              />
            )}
            emptyStateControls={
              canAdd && (
                <ToolbarAddButton
                  key="add"
                  linkTo="/execution_environment_builders/add"
                />
              )
            }
          />
        </Card>
      </PageSection>
      <AlertModal
        aria-label={t`Deletion error`}
        isOpen={Boolean(deletionError)}
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
