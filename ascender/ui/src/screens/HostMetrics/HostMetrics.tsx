import React, { useCallback, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import { HostMetricsAPI } from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
} from 'components/PaginatedTable';
import DataListToolbar from 'components/DataListToolbar';
import { getQSConfig, parseQueryString } from 'util/qs';
import { Card, PageSection } from '@patternfly/react-core';
import { useLocation } from 'react-router';
import useSelected from 'hooks/useSelected';
import { useConfig } from 'contexts/Config';
import HostMetricsListItem from './HostMetricsListItem';
import HostMetricsDeleteButton from './HostMetricsDeleteButton';

const QS_CONFIG = getQSConfig('host_metrics', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
  deleted: false,
});

function HostMetrics() {
  const { t } = useLingui();
  // A system auditor reads host metrics but the api takes the soft delete
  // from a superuser alone, so only a superuser is offered it.
  const { me } = useConfig();
  const canSoftDelete = Boolean(me?.is_superuser);
  const location = useLocation();

  const [breadcrumbConfig] = useState({
    '/host_metrics': t`Host Metrics`,
  });
  const {
    result: { count, results },
    isLoading,
    error,
    request: readHostMetrics,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const list = await HostMetricsAPI.read(params);
      return {
        count: list.data.count,
        results: list.data.results,
      };
    }, [location]),
    { results: [], count: 0 }
  );

  useEffect(() => {
    readHostMetrics();
  }, [readHostMetrics]);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(results);

  // A failed soft delete used to reject unseen, leaving the rows as they
  // were with nothing said. This keeps the error to show, and steps back a
  // page when the last rows of one are gone, as other lists do.
  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteHostMetrics,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((hostMetric) => HostMetricsAPI.destroy(hostMetric.id))
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: readHostMetrics,
    }
  );

  const handleDelete = async () => {
    await deleteHostMetrics();
    clearSelected();
  };

  return (
    <>
      <ScreenHeader streamType="none" breadcrumbConfig={breadcrumbConfig} />
      <PageSection hasBodyWrapper={false}>
        <Card>
          <PaginatedTable
            contentError={error}
            hasContentLoading={isLoading || isDeleteLoading}
            items={results}
            itemCount={count}
            pluralizedItemName={t`Host Metrics`}
            renderRow={(item, index) => (
              <HostMetricsListItem
                key={item.id}
                item={item}
                isSelected={selected.some(
                  (row) => row.hostname === item.hostname
                )}
                onSelect={() => handleSelect(item)}
                rowIndex={index}
                isSelectable={canSoftDelete}
              />
            )}
            qsConfig={QS_CONFIG}
            toolbarSearchColumns={[
              {
                name: t`Hostname`,
                key: 'hostname__icontains',
                isDefault: true,
              },
            ]}
            toolbarSearchableKeys={[]}
            toolbarRelatedSearchableKeys={[]}
            renderToolbar={(props) => (
              <DataListToolbar
                {...props}
                advancedSearchDisabled
                fillWidth
                isAllSelected={isAllSelected}
                // A selection is only ever for the soft delete, so a viewer
                // who is not offered it has no checkboxes to tick either.
                onSelectAll={canSoftDelete ? selectAll : undefined}
                additionalControls={
                  canSoftDelete
                    ? [
                        <HostMetricsDeleteButton
                          key="delete"
                          onDelete={handleDelete}
                          itemsToDelete={selected}
                          pluralizedItemName={t`Host Metrics`}
                        />,
                      ]
                    : []
                }
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG} isSelectable={canSoftDelete}>
                <HeaderCell sortKey="hostname">{t`Hostname`}</HeaderCell>
                <HeaderCell
                  sortKey="first_automation"
                  tooltip={t`When was the host first automated`}
                >
                  {t`First Automated`}
                </HeaderCell>
                <HeaderCell
                  sortKey="last_automation"
                  tooltip={t`When was the host last automated`}
                >
                  {t`Last Automated`}
                </HeaderCell>
                <HeaderCell
                  sortKey="automated_counter"
                  tooltip={t`How many times was the host automated`}
                >
                  {t`Automation`}
                </HeaderCell>
                <HeaderCell
                  sortKey="deleted_counter"
                  tooltip={t`How many times was the host deleted`}
                >
                  {t`Deleted`}
                </HeaderCell>
              </HeaderRow>
            }
          />
        </Card>
      </PageSection>
      <AlertModal
        isOpen={Boolean(deletionError)}
        variant="error"
        aria-label={t`Deletion Error`}
        title={t`Error!`}
        onClose={clearDeletionError}
      >
        {t`Failed to soft delete one or more host metrics.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export { HostMetrics as _HostMetrics };
export default HostMetrics;
