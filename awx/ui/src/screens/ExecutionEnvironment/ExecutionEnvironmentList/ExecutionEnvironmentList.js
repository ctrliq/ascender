import React, { useEffect, useCallback } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Card, PageSection } from '@patternfly/react-core';

import { ExecutionEnvironmentsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
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
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import ExecutionEnvironmentsListItem from './ExecutionEnvironmentListItem';

const QS_CONFIG = getQSConfig('execution_environments', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function ExecutionEnvironmentList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();
  const { addToast, Toast, toastProps } = useToast();

  const {
    error: contentError,
    isLoading,
    request: fetchExecutionEnvironments,
    result: {
      executionEnvironments,
      executionEnvironmentsCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, responseActions] = await Promise.all([
        ExecutionEnvironmentsAPI.read(params),
        ExecutionEnvironmentsAPI.readOptions(),
      ]);

      return {
        executionEnvironments: response.data.results,
        executionEnvironmentsCount: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location]),
    {
      executionEnvironments: [],
      executionEnvironmentsCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchExecutionEnvironments();
  }, [fetchExecutionEnvironments]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(executionEnvironments);

  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: deleteExecutionEnvironments,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(async () => {
      await Promise.all(
        selected.map(({ id }) => ExecutionEnvironmentsAPI.destroy(id))
      );
    }, [selected]),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchExecutionEnvironments,
    }
  );

  const handleCopy = useCallback(
    (newId) => {
      addToast({
        id: newId,
        title: i18n._(msg`Execution environment copied successfully`),
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    },
    [addToast, i18n]
  );

  const handleDelete = async () => {
    await deleteExecutionEnvironments();
    clearSelected();
  };

  const canAdd = actions && actions.POST;
  const deleteDetailsRequests =
    relatedResourceDeleteRequests.executionEnvironment(selected[0]);
  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            ouiaId="execution-environment-table"
            contentError={contentError}
            hasContentLoading={isLoading || deleteLoading}
            items={executionEnvironments}
            itemCount={executionEnvironmentsCount}
            pluralizedItemName={i18n._(msg`Execution Environments`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: i18n._(msg`Image`),
                key: 'image__icontains',
              },
            ]}
            toolbarSortColumns={[
              {
                name: i18n._(msg`Image`),
                key: 'image',
              },
              {
                name: i18n._(msg`Created`),
                key: 'created',
              },
              {
                name: i18n._(msg`Organization`),
                key: 'organization',
              },
              {
                name: i18n._(msg`Description`),
                key: 'description',
              },
            ]}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Image`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Organization`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
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
                          ouiaId="add-execution-environment"
                          key="add"
                          linkTo={`${match.url}/add`}
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(msg`Execution Environments`)}
                    deleteDetailsRequests={deleteDetailsRequests}
                    deleteMessage={i18n._(msg({
                      id: 'deleteExecutionEnvironments',
                      message: selected.length === 1
                        ? 'This execution environment is currently being used by other resources. Are you sure you want to delete it?'
                        : 'These execution environments could be in use by other resources that rely on them. Are you sure you want to delete them anyway?'
                    }))}
                  />,
                ]}
              />
            )}
            renderRow={(executionEnvironment, index) => (
              <ExecutionEnvironmentsListItem
                key={executionEnvironment.id}
                rowIndex={index}
                executionEnvironment={executionEnvironment}
                detailUrl={`${match.url}/${executionEnvironment.id}/details`}
                onSelect={() => handleSelect(executionEnvironment)}
                onCopy={handleCopy}
                isSelected={selected.some(
                  (row) => row.id === executionEnvironment.id
                )}
                fetchExecutionEnvironments={fetchExecutionEnvironments}
              />
            )}
            emptyStateControls={
              canAdd && (
                <ToolbarAddButton key="add" linkTo={`${match.url}/add`} />
              )
            }
          />
        </Card>
      </PageSection>
      <AlertModal
        aria-label={i18n._(msg`Deletion error`)}
        isOpen={deletionError}
        onClose={clearDeletionError}
        title={i18n._(msg`Error`)}
        variant="error"
      >
        {i18n._(msg`Failed to delete one or more execution environments`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
      <Toast {...toastProps} />
    </>
  );
}

export default ExecutionEnvironmentList;
