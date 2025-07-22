import React, { useCallback, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import { HostMetricsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
} from 'components/PaginatedTable';
import DataListToolbar from 'components/DataListToolbar';
import { getQSConfig, parseQueryString } from 'util/qs';
import { Card, PageSection } from '@patternfly/react-core';
import { useLocation } from 'react-router-dom';
import useSelected from 'hooks/useSelected';
import HostMetricsListItem from './HostMetricsListItem';
import HostMetricsDeleteButton from './HostMetricsDeleteButton';

const QS_CONFIG = getQSConfig('host_metrics', {
  page: 1,
  page_size: 20,
  order_by: 'hostname',
  deleted: false,
});

function HostMetrics() {
  const { i18n } = useLingui();
  const location = useLocation();

  const [breadcrumbConfig] = useState({
    '/host_metrics': i18n._(msg`Host Metrics`),
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

  return (
    <>
      <ScreenHeader streamType="none" breadcrumbConfig={breadcrumbConfig} />
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={error}
            hasContentLoading={isLoading}
            items={results}
            itemCount={count}
            pluralizedItemName={i18n._(msg`Host Metrics`)}
            renderRow={(item, index) => (
              <HostMetricsListItem
                key={item.id}
                item={item}
                isSelected={selected.some(
                  (row) => row.hostname === item.hostname
                )}
                onSelect={() => handleSelect(item)}
                rowIndex={index}
              />
            )}
            qsConfig={QS_CONFIG}
            toolbarSearchColumns={[
              {
                name: i18n._(msg`Hostname`),
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
                onSelectAll={selectAll}
                additionalControls={[
                  <HostMetricsDeleteButton
                    key="delete"
                    onDelete={() =>
                      Promise.all(
                        selected.map((hostMetric) =>
                          HostMetricsAPI.destroy(hostMetric.id)
                        )
                      ).then(() => {
                        readHostMetrics();
                        clearSelected();
                      })
                    }
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(msg`Host Metrics`)}
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="hostname">
                  {i18n._(msg`Hostname`)}
                </HeaderCell>
                <HeaderCell
                  sortKey="first_automation"
                  tooltip={i18n._(msg`When was the host first automated`)}
                >
                  {i18n._(msg`First automated`)}
                </HeaderCell>
                <HeaderCell
                  sortKey="last_automation"
                  tooltip={i18n._(msg`When was the host last automated`)}
                >
                  {i18n._(msg`Last automated`)}
                </HeaderCell>
                <HeaderCell
                  sortKey="automated_counter"
                  tooltip={i18n._(msg`How many times was the host automated`)}
                >
                  {i18n._(msg`Automation`)}
                </HeaderCell>
                <HeaderCell
                  sortKey="deleted_counter"
                  tooltip={i18n._(msg`How many times was the host deleted`)}
                >
                  {i18n._(msg`Deleted`)}
                </HeaderCell>
              </HeaderRow>
            }
          />
        </Card>
      </PageSection>
    </>
  );
}

export { HostMetrics as _HostMetrics };
export default HostMetrics;
