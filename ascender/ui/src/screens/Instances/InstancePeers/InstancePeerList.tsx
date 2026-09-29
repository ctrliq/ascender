import type { ReceptorAddress, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { CardBody } from 'components/Card';
import PaginatedTable, {
  getSearchableKeys,
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
} from 'components/PaginatedTable';
import DisassociateButton from 'components/DisassociateButton';
import AssociateModal from 'components/AssociateModal';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import useToast, { AlertVariant } from 'hooks/useToast';
import { getQSConfig, parseQueryString } from 'util/qs';
import { useLocation, useParams } from 'react-router';
import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import DataListToolbar from 'components/DataListToolbar';
import { InstancesAPI, ReceptorAPI } from 'api';
import useExpanded from 'hooks/useExpanded';
import { useConfig } from 'contexts/Config';
import useSelected from 'hooks/useSelected';
import type { QSParams } from 'util/qs';
import InstancePeerListItem from './InstancePeerListItem';

/**
 * A receptor address with the instance it belongs to named beside it.
 *
 * The addresses endpoint gives only the instance's id, so the list looks each
 * one up and copies the fields the row shows onto the address: the name and
 * the node type the row itself renders, and the four the drawer under it does.
 */
export type PeerAddress = ReceptorAddress & {
  hostname?: string | null;
  node_type?: string | null;
  jobs_running?: number;
  jobs_total?: number;
  managed_by_policy?: boolean | null;
  last_health_check?: string | null;
};

const QS_CONFIG = getQSConfig('peer', {
  page: 1,
  page_size: 20,
  order_by: 'pk',
});

export interface InstancePeerListProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function InstancePeerList({ setBreadcrumb }: InstancePeerListProps) {
  const { t } = useLingui();
  const { me } = useConfig();
  const location = useLocation();
  const { id } = useParams() as { id: string };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast, Toast, toastProps } = useToast();
  // The add modal lists receptor addresses, so its advanced search keys are
  // theirs rather than an instance's.
  const readAddressOptions = useCallback(() => ReceptorAPI.readOptions(), []);
  const {
    isLoading,
    error: contentError,
    request: fetchPeers,
    result: { instance, peers, count, relatedSearchableKeys, searchableKeys },
  } = useCachedRequest(
    ['instance-peer-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        { data: detail },
        {
          data: { results, count: peerCount },
        },
        actions,
      ] = await Promise.all([
        InstancesAPI.readDetail(id),
        InstancesAPI.readPeers(id, params),
        // The rows are receptor addresses, so theirs are the fields the
        // advanced search can filter on, not an instance's.
        ReceptorAPI.readOptions(),
      ]);

      // The instances these addresses belong to, asked for by id: reading
      // the first page of every instance left a peer beyond it nameless.
      const instanceIds = [...new Set(results.map((obj) => obj.instance))];
      const hosts = instanceIds.length
        ? (
            await InstancesAPI.read({
              id__in: instanceIds.join(','),
              page_size: instanceIds.length,
            })
          ).data.results
        : [];

      const address_list: PeerAddress[] = [];

      results.forEach((receptor) => {
        const host = hosts.find((obj) => obj.id === receptor.instance);
        address_list.push({
          ...receptor,
          hostname: host?.hostname,
          node_type: host?.node_type,
          jobs_running: host?.jobs_running,
          jobs_total: host?.jobs_total,
          managed_by_policy: host?.managed_by_policy,
          last_health_check: host?.last_health_check,
        });
      });

      return {
        instance: detail,
        peers: address_list,
        // The api's count, since the rows are one page of it.
        count: peerCount,
        relatedSearchableKeys: (actions.data.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(actions.data.actions?.GET),
      };
    }, [id, location.search]),
    {
      instance: {},
      peers: [] as PeerAddress[],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    if (instance) {
      setBreadcrumb(instance);
    }
  }, [instance, setBreadcrumb]);

  const { expanded, isAllExpanded, handleExpand, expandAll } =
    useExpanded(peers);
  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(peers);

  const fetchPeersToAssociate = useCallback(
    async (params: QSParams) => {
      const address_list: PeerAddress[] = [];

      // do not show this instance or instances that are already peered
      // to this instance (reverse_peers)
      const not_instances = [...(instance.reverse_peers ?? []), instance.id];

      params.not__instance = not_instances;
      params.is_internal = false;
      // do not show the current peers
      if (instance.peers?.length) {
        params.not__id__in = instance.peers.join(',');
      }

      const receptoraddresses = await ReceptorAPI.read(params);

      // retrieve the instances that are associated with those receptor addresses
      const instance_ids = receptoraddresses.data.results.map(
        (obj) => obj.instance
      );
      const instance_ids_str = instance_ids.join(',');
      const instances = await InstancesAPI.read({ id__in: instance_ids_str });

      receptoraddresses.data.results.forEach((receptor) => {
        const host = instances.data.results.find(
          (obj) => obj.id === receptor.instance
        );
        address_list.push({
          ...receptor,
          hostname: host?.hostname,
          node_type: host?.node_type,
          jobs_running: host?.jobs_running,
          jobs_total: host?.jobs_total,
          managed_by_policy: host?.managed_by_policy,
          last_health_check: host?.last_health_check,
        });
      });

      receptoraddresses.data.results = address_list;

      return receptoraddresses;
    },
    [instance]
  );

  const {
    isLoading: isAssociateLoading,
    request: handlePeerAssociate,
    error: associateError,
  } = useRequest(
    useCallback(
      async (instancesPeerToAssociate: PeerAddress[]) => {
        const selected_peers = instancesPeerToAssociate.map((obj) => obj.id);

        const new_peers = [
          ...new Set([...(instance.peers ?? []), ...selected_peers]),
        ];
        await InstancesAPI.update(instance.id, { peers: new_peers });

        fetchPeers();
        addToast({
          id: instance.id,
          title: t`Peers associated with ${instance.hostname}. Run the install bundle for ${instance.hostname} again for the change to take effect.`,
          variant: AlertVariant.success,
          hasTimeout: true,
        });
      },
      [instance, fetchPeers, addToast, t]
    )
  );

  const {
    isLoading: isDisassociateLoading,
    request: handlePeersDiassociate,
    error: disassociateError,
  } = useRequest(
    useCallback(async () => {
      const selected_ids = selected.map((obj) => obj.id);
      const new_peers = (instance.peers ?? []).filter(
        (s_id) => !selected_ids.includes(s_id)
      );
      await InstancesAPI.update(instance.id, { peers: new_peers });

      fetchPeers();
      addToast({
        title: t`Peers disassociated from ${instance.hostname}. Run the install bundle for ${instance.hostname} again for the change to take effect.`,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    }, [instance, selected, fetchPeers, addToast, t])
  );

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  const isHopNode = instance.node_type === 'hop';
  const isExecutionNode = instance.node_type === 'execution';
  // Peering is a change to the instance itself, so it follows the details
  // page's Edit: a superuser, on an instance the install does not manage.
  const canEditPeers = Boolean(me?.is_superuser) && !instance.managed;

  return (
    <CardBody>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={
          isLoading || isDisassociateLoading || isAssociateLoading
        }
        items={peers}
        itemCount={count}
        pluralizedItemName={t`Peers`}
        qsConfig={QS_CONFIG}
        onRowClick={handleSelect}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        /*
         * The rows are receptor addresses, which the api filters and orders
         * by their own fields: the name and node type are the instance's,
         * reached through it, and a bare hostname is refused with a 400.
         */
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'instance__hostname__icontains',
            isDefault: true,
          },
        ]}
        toolbarSortColumns={[
          {
            name: t`Name`,
            key: 'instance__hostname',
          },
        ]}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isExpandable>
            <HeaderCell sortKey="instance__hostname">
              {t`Instance Name`}
            </HeaderCell>
            <HeaderCell sortKey="address">{t`Address`}</HeaderCell>
            <HeaderCell sortKey="port">{t`Port`}</HeaderCell>
            <HeaderCell sortKey="instance__node_type">{t`Node Type`}</HeaderCell>
            <HeaderCell sortKey="canonical">{t`Canonical`}</HeaderCell>
          </HeaderRow>
        }
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            isAllExpanded={isAllExpanded}
            onExpandAll={expandAll}
            qsConfig={QS_CONFIG}
            // Left out rather than passed as false: the toolbar wraps each
            // control in an item keyed by it, and two falses share no key.
            additionalControls={
              (isExecutionNode || isHopNode) && canEditPeers
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Peer`}
                      ouiaId="add-instance-peers-button"
                      key="associate"
                      onClick={() => setIsModalOpen(true)}
                    />,
                    <DisassociateButton
                      verifyCannotDisassociate={false}
                      key="disassociate"
                      onDisassociate={handlePeersDiassociate}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate these peers?`}
                    />,
                  ]
                : []
            }
          />
        )}
        renderRow={(peer: PeerAddress, index: number) => (
          <InstancePeerListItem
            isSelected={selected.some((row) => row.id === peer.id)}
            onSelect={() => handleSelect(peer)}
            isExpanded={expanded.some((row) => row.id === peer.id)}
            onExpand={() => handleExpand(peer)}
            key={peer.id}
            peerInstance={peer}
            rowIndex={index}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Instances`}
          fetchRequest={fetchPeersToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handlePeerAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Peers`}
          optionsRequest={readAddressOptions}
          displayKey="address"
          columns={[
            { key: 'hostname', name: t`Name` },
            { key: 'address', name: t`Address` },
            { key: 'port', name: t`Port` },
            { key: 'node_type', name: t`Node Type` },
            { key: 'protocol', name: t`Protocol` },
          ]}
        />
      )}
      <Toast {...toastProps} />
      {Boolean(error) && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {Boolean(associateError) && t`Failed to associate one or more peers.`}
          {Boolean(disassociateError) &&
            t`Failed to disassociate one or more peers.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default InstancePeerList;
