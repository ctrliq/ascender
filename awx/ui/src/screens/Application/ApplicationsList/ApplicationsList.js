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
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Description`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Organization`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Created By`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Modified By`)}</HeaderCell>
                <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DatalistToolbar
                {...props}
                isAllSelected={isAllSelected}
                onSelectAll={selectAll}
                canAdd={canAdd}
                addButtonText={i18n._(msg`Create application`)}
                onAdd={() => {
                  clearSelected();
                  match.history.push(`${match.url}/add`);
                }}
                deleteButtonText={i18n._(msg`Delete selected applications`)}
                onDelete={handleDeleteApplications}
                isDeleteDisabled={!selected.length}
              />
            )}
            renderRow={(application) => (
              <ApplicationListItem
                key={application.id}
                application={application}
                isSelected={selected.some((row) => row.id === application.id)}
                onSelect={() => handleSelect(application)}
              />
            )}
          />
        </Card>
      </PageSection>
      <AlertModal
        isOpen={Boolean(deletionError)}
        variant="danger"
        title={i18n._(msg`Error deleting applications`)}
        onClose={clearDeletionError}
      >
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default ApplicationsList;
