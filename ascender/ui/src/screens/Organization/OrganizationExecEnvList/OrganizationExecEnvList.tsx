import type { Organization } from 'types/api';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import { ExecutionEnvironmentsAPI, OrganizationsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import DatalistToolbar from 'components/DataListToolbar';

import OrganizationExecEnvListItem from './OrganizationExecEnvListItem';

const QS_CONFIG = getQSConfig('organizations', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

export interface OrganizationExecEnvListProps {
  organization: Organization;
  [key: string]: unknown;
}

function OrganizationExecEnvList({
  organization,
}: OrganizationExecEnvListProps) {
  const { id, name } = organization;
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLingui();
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
  } = useCachedRequest(
    ['organization-exec-env-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, responseActions] = await Promise.all([
        OrganizationsAPI.readExecutionEnvironments(id, params),
        OrganizationsAPI.readExecutionEnvironmentsOptions(id),
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
    }, [location, id]),
    {
      executionEnvironments: [],
      executionEnvironmentsCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(executionEnvironments);

  /*
   * An execution environment listed here belongs to this organization, so
   * taking it off the tab means deleting it, as the Execution Environments
   * list does, with the same count of what still uses it.
   */
  const {
    isLoading: isDeleteLoading,
    deletionError,
    deleteItems: deleteExecutionEnvironments,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((environment) =>
            ExecutionEnvironmentsAPI.destroy(environment.id)
          )
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchExecutionEnvironments,
    }
  );

  const handleDelete = async () => {
    await deleteExecutionEnvironments();
    clearSelected();
  };

  /*
   * The organization's own endpoint offers POST to whoever may add an
   * execution environment to it, which is who the Add button is for. The
   * add screen is the one the Execution Environments list uses, handed this
   * organization so the new one lands in it and Cancel comes back here.
   */
  const addButton = (actions as { POST?: unknown })?.POST ? (
    <ToolbarAddButton
      key="add"
      tooltip={t`Add Execution Environment`}
      onClick={() =>
        navigate('/execution_environments/add', {
          state: { organization: { id, name } },
        })
      }
    />
  ) : null;

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDeleteLoading}
        items={executionEnvironments}
        itemCount={executionEnvironmentsCount}
        pluralizedItemName={t`Execution Environments`}
        emptyContentMessage={t`Execution environments assigned to this organization appear here`}
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
            isDefault: false,
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
        renderToolbar={(props) => (
          <DatalistToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(addButton ? [addButton] : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Execution Environments`}
                deleteDetailsRequests={relatedResourceDeleteRequests.executionEnvironment(
                  selected[0]
                )}
                deleteMessage={
                  selected.length === 1
                    ? t`This execution environment is currently being used by other resources. Are you sure you want to delete it?`
                    : t`These execution environments could be in use by other resources that rely on them. Are you sure you want to delete them anyway?`
                }
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell sortKey="image">{t`Image`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(executionEnvironment, index) => (
          <OrganizationExecEnvListItem
            key={executionEnvironment.id}
            executionEnvironment={executionEnvironment}
            detailUrl={`/execution_environments/${executionEnvironment.id}`}
            isSelected={selected.some(
              (row) => row.id === executionEnvironment.id
            )}
            onSelect={() => handleSelect(executionEnvironment)}
            rowIndex={index}
          />
        )}
      />
      <AlertModal
        aria-label={t`Deletion error`}
        isOpen={Boolean(deletionError)}
        onClose={clearDeletionError}
        title={t`Error!`}
        variant="error"
      >
        {t`Failed to delete one or more execution environments.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default OrganizationExecEnvList;
