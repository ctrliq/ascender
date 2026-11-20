import type { ReceptorAddress, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { CardBody } from 'components/Card';
import PaginatedTable, {
  getSearchableKeys,
  HeaderCell,
  HeaderRow,
  // ToolbarAddButton,
} from 'components/PaginatedTable';
import useToast from 'hooks/useToast';
import { getQSConfig, parseQueryString } from 'util/qs';
import { useLocation, useParams } from 'react-router';
import useRequest from 'hooks/useRequest';
import DataListToolbar from 'components/DataListToolbar';
import { InstancesAPI, ReceptorAPI } from 'api';
import useSelected from 'hooks/useSelected';
import InstanceListenerAddressListItem from './InstanceListenerAddressListItem';

const QS_CONFIG = getQSConfig('address', {
  page: 1,
  page_size: 20,
  order_by: 'pk',
});

export interface InstanceListenerAddressListProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function InstanceListenerAddressList({
  setBreadcrumb,
}: InstanceListenerAddressListProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const { Toast, toastProps } = useToast();
  const {
    isLoading,
    error: contentError,
    request: fetchListenerAddresses,
    result: {
      instance,
      listenerAddresses,
      count,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      /*
       * The instance's own addresses endpoint, with the list's search, sort
       * and page sent along, rather than the first page of every address in
       * the cluster filtered here: that missed any address past the first 25
       * and ignored the toolbar altogether.
       */
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        { data: detail },
        {
          data: { results, count: addressCount },
        },
        actions,
      ] = await Promise.all([
        InstancesAPI.readDetail(id),
        InstancesAPI.readReceptorAddresses(id, params),
        // The addresses' own fields, which are what the advanced search can
        // filter them on, not an instance's.
        ReceptorAPI.readOptions(),
      ]);

      return {
        instance: detail,
        listenerAddresses: results,
        count: addressCount,
        relatedSearchableKeys: (actions.data.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(actions.data.actions?.GET),
      };
    }, [id, location.search]),
    {
      instance: {},
      listenerAddresses: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchListenerAddresses();
  }, [fetchListenerAddresses]);

  useEffect(() => {
    if (instance) {
      setBreadcrumb(instance);
    }
  }, [instance, setBreadcrumb]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(listenerAddresses);

  return (
    <CardBody>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading}
        items={listenerAddresses}
        itemCount={count}
        pluralizedItemName={t`Listener Addresses`}
        qsConfig={QS_CONFIG}
        onRowClick={handleSelect}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        // An address has no name of its own: it is the host it answers on.
        toolbarSearchColumns={[
          {
            name: t`Address`,
            key: 'address__icontains',
            isDefault: true,
          },
        ]}
        toolbarSortColumns={[
          {
            name: t`Address`,
            key: 'address',
          },
        ]}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="address">{t`Address`}</HeaderCell>
            <HeaderCell sortKey="port">{t`Port`}</HeaderCell>
            <HeaderCell sortKey="protocol">{t`Protocol`}</HeaderCell>
            <HeaderCell sortKey="canonical">{t`Canonical`}</HeaderCell>
          </HeaderRow>
        }
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[]}
          />
        )}
        renderRow={(listenerAddress: ReceptorAddress, index: number) => (
          <InstanceListenerAddressListItem
            isSelected={selected.some((row) => row.id === listenerAddress.id)}
            onSelect={() => handleSelect(listenerAddress)}
            key={listenerAddress.id}
            peerListenerAddress={listenerAddress}
            rowIndex={index}
          />
        )}
      />
      <Toast {...toastProps} />
    </CardBody>
  );
}

export default InstanceListenerAddressList;
