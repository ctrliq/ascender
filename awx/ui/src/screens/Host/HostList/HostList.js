import React, { useEffect, useCallback } from 'react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Card, PageSection } from '@patternfly/react-core';
import { HostsAPI } from 'api';
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
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { encodeQueryString, getQSConfig, parseQueryString } from 'util/qs';

import HostListItem from './HostListItem';
import SmartInventoryButton from './SmartInventoryButton';

const QS_CONFIG = getQSConfig('host', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function HostList() {
  const { i18n } = useLingui();
  const history = useHistory();
  const location = useLocation();
  const match = useRouteMatch();
  const parsedQueryStrings = parseQueryString(QS_CONFIG, location.search);
  const nonDefaultSearchParams = {};

  Object.keys(parsedQueryStrings).forEach((key) => {
    if (!QS_CONFIG.defaultParams[key]) {
      nonDefaultSearchParams[key] = parsedQueryStrings[key];
    }
  });

  const hasAnsibleFactsKeys = () => {
    const nonDefaultSearchValues = Object.values(nonDefaultSearchParams);
    return (
      nonDefaultSearchValues.filter((value) => value.includes('ansible_facts'))
        .length > 0
    );
  };

  const hasInvalidHostFilterKeys = () => {
    const nonDefaultSearchKeys = Object.keys(nonDefaultSearchParams);
    return (
      nonDefaultSearchKeys.filter((searchKey) => searchKey.startsWith('not__'))
        .length > 0 ||
      nonDefaultSearchKeys.filter((searchKey) => searchKey.endsWith('__search'))
        .length > 0
    );
  };

  const {
    result: { hosts, count, actions, relatedSearchableKeys, searchableKeys },
    error: contentError,
    isLoading,
    request: fetchHosts,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const results = await Promise.all([
        HostsAPI.read(params),
        HostsAPI.readOptions(),
      ]);
      return {
        hosts: results[0].data.results,
        count: results[0].data.count,
        actions: results[1].data.actions,
        relatedSearchableKeys: (
          results[1]?.data?.related_search_fields || []
        ).map((val) => (val.endsWith('search') ? val.slice(0, -8) : val)),
        searchableKeys: getSearchableKeys(results[1].data.actions?.GET),
      };
    }, [location]),
    {
      hosts: [],
      count: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchHosts();
  }, [fetchHosts]);

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(hosts);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteHosts,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () => Promise.all(selected.map((host) => HostsAPI.destroy(host.id))),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchHosts,
    }
  );

  const handleHostDelete = async () => {
    await deleteHosts();
    clearSelected();
  };

  const handleSmartInventoryClick = () => {
    history.push(
      `/inventories/smart_inventory/add?host_filter=${encodeURIComponent(
        encodeQueryString(nonDefaultSearchParams)
      )}`
    );
  };

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

  return (
    <PageSection>
      <Card>
        <PaginatedTable
          contentError={contentError}
          hasContentLoading={isLoading || isDeleteLoading}
          items={hosts}
          itemCount={count}
          pluralizedItemName={i18n._(msg`Hosts`)}
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
            {
              name: i18n._(msg`Created By (Username)`),
              key: 'created_by__username__icontains',
            },
            {
              name: i18n._(msg`Modified By (Username)`),
              key: 'modified_by__username__icontains',
            },
          ]}
          toolbarSearchableKeys={searchableKeys}
          toolbarRelatedSearchableKeys={relatedSearchableKeys}
          headerRow={
            <HeaderRow qsConfig={QS_CONFIG}>
              <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
              <HeaderCell>{i18n._(msg`Activity`)}</HeaderCell>
              <HeaderCell sortKey="description">
                {i18n._(msg`Description`)}
              </HeaderCell>
              <HeaderCell>{i18n._(msg`Inventory`)}</HeaderCell>
              <HeaderCell>{i18n._(msg`Actions`)}</HeaderCell>
            </HeaderRow>
          }
          renderToolbar={(props) => (
            <DataListToolbar
              {...props}
              isAllSelected={isAllSelected}
              onSelectAll={selectAll}
              qsConfig={QS_CONFIG}
              additionalControls={[
                ...(canAdd
                  ? [<ToolbarAddButton key="add" linkTo={`${match.url}/add`} />]
                  : []),
                <ToolbarDeleteButton
                  key="delete"
                  onDelete={handleHostDelete}
                  itemsToDelete={selected}
                  pluralizedItemName={i18n._(msg`Hosts`)}
                />,
                ...(canAdd
                  ? [
                      <SmartInventoryButton
                        hasInvalidKeys={hasInvalidHostFilterKeys()}
                        hasAnsibleFactsKeys={hasAnsibleFactsKeys()}
                        isDisabled={
                          Object.keys(nonDefaultSearchParams).length === 0 ||
                          hasInvalidHostFilterKeys() ||
                          hasAnsibleFactsKeys()
                        }
                        onClick={() => handleSmartInventoryClick()}
                      />,
                    ]
                  : []),
              ]}
            />
          )}
          renderRow={(host, index) => (
            <HostListItem
              key={host.id}
              host={host}
              detailUrl={`${match.url}/${host.id}/details`}
              isSelected={selected.some((row) => row.id === host.id)}
              onSelect={() => handleSelect(host)}
              rowIndex={index}
            />
          )}
          emptyStateControls={
            canAdd ? (
              <ToolbarAddButton key="add" linkTo={`${match.url}/add`} />
            ) : null
          }
        />
      </Card>
      {deletionError && (
        <AlertModal
          isOpen={deletionError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={clearDeletionError}
        >
          {i18n._(msg`Failed to delete one or more hosts.`)}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </PageSection>
  );
}

export default HostList;
