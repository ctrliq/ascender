import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { Card, PageSection } from '@patternfly/react-core';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import { ApplicationsAPI } from 'api';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarDeleteButton,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useSelected from 'hooks/useSelected';
import ApplicationListItem from './ApplicationListItem';

const QS_CONFIG = getQSConfig('applications', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});
function ApplicationsList() {
  const { i18n } = useLingui();
  const location = useLocation();
  const match = useRouteMatch();

  const {
    isLoading,
    error,
    request: fetchApplications,
    result: {
      applications,
      itemCount,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, actionsResponse] = await Promise.all([
        ApplicationsAPI.read(params),
        ApplicationsAPI.readOptions(),
      ]);

      return {
        applications: response.data.results,
        itemCount: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      applications: [],
      itemCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(applications);

  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: deleteApplications,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map(({ id }) => ApplicationsAPI.destroy(id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchApplications,
    }
  );

  const handleDeleteApplications = async () => {
    await deleteApplications();
    clearSelected();
  };

  const canAdd = actions && actions.POST;

  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={error}
            hasContentLoading={isLoading || deleteLoading}
            items={applications}
            itemCount={itemCount}
            pluralizedItemName={i18n._(msg`Applications`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: i18n._(msg`Description`),
                key: 'description__icontains',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
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
                          key="add"
                          linkTo={`${match.url}/add`}
                        />,
                      ]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleDeleteApplications}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(msg`Applications`)}
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
                <HeaderCell sortKey="organization">
                  {i18n._(msg`Organization`)}
                </HeaderCell>
                <HeaderCell>{i18n._(msg`Last Modified`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderRow={(application, index) => (
              <ApplicationListItem
                key={application.id}
                value={application.name}
                application={application}
                detailUrl={`${match.url}/${application.id}/details`}
                onSelect={() => handleSelect(application)}
                isSelected={selected.some((row) => row.id === application.id)}
                rowIndex={index}
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
        isOpen={deletionError}
        variant="error"
        title={i18n._(msg`Error!`)}
        onClose={clearDeletionError}
      >
        {i18n._(msg`Failed to delete one or more applications.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default ApplicationsList;
