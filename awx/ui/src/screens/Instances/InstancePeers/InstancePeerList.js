import React, { useCallback, useEffect, useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
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
import { useLocation, useParams } from 'react-router-dom';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import DataListToolbar from 'components/DataListToolbar';
import { InstancesAPI, ReceptorAPI } from 'api';
import useExpanded from 'hooks/useExpanded';
import useSelected from 'hooks/useSelected';
import InstancePeerListItem from './InstancePeerListItem';

const QS_CONFIG = getQSConfig('peer', {
  page: 1,
  page_size: 20,
  order_by: 'pk',
});

function InstancePeerList({ setBreadcrumb }) {
  const { i18n } = useLingui();
  const location = useLocation();
  const { id } = useParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast, Toast, toastProps } = useToast();
  const readInstancesOptions = useCallback(
    () => InstancesAPI.readOptions(id),
    [id]
  );
  const {
    isLoading,
    error: contentError,
    request: fetchPeers,
    result: { instance, peers, count, relatedSearchableKeys, searchableKeys },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        { data: detail },
        {
          data: { results },
        },
        actions,
        instances,
      ] = await Promise.all([
        InstancesAPI.readDetail(id),
        InstancesAPI.readPeers(id, params),
        InstancesAPI.readOptions(),
        InstancesAPI.read(),
      ]);

      const address_list = [];

      for (let q = 0; q < results.length; q++) {
        const receptor = results[q];
        if (receptor.managed === true) continue;
        const host = instances.data.results.filter(
          (obj) => obj.id === receptor.instance
        )[0];
        const copy = receptor;
        copy.hostname = host.hostname;
        copy.node_type = host.node_type;
        address_list.push(copy);
      }

      return {
        instance: detail,
        peers: address_list,
        count: address_list.length,
        relatedSearchableKeys: (actions?.data?.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        searchableKeys: getSearchableKeys(actions.data.actions?.GET),
      };
    }, [id, location]),
    {
      instance: {},
      peers: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchPeers();
  }, [fetchPeers]);

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
    async (params) => {
      const address_list = [];

      // do not show this instance or instances that are already peered
      // to this instance (reverse_peers)
      const not_instances = instance.reverse_peers;
      not_instances.push(instance.id);

      params.not__instance = not_instances;
      params.is_internal = false;
      // do not show the current peers
      if (instance.peers.length > 0) {
        params.not__id__in = instance.peers.join(',');
      }

      const receptoraddresses = await ReceptorAPI.read(params);

      // retrieve the instances that are associated with those receptor addresses
      const instance_ids = receptoraddresses.data.results.map(
        (obj) => obj.instance
      );
      const instance_ids_str = instance_ids.join(',');
      const instances = await InstancesAPI.read({ id__in: instance_ids_str });

      for (let q = 0; q < receptoraddresses.data.results.length; q++) {
        const receptor = receptoraddresses.data.results[q];

        const host = instances.data.results.filter(
          (obj) => obj.id === receptor.instance
        )[0];

        const copy = receptor;
        copy.hostname = host.hostname;
        copy.node_type = host.node_type;
        copy.canonical = copy.canonical.toString();
        address_list.push(copy);
      }

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
      async (instancesPeerToAssociate) => {
        const selected_peers = instancesPeerToAssociate.map((obj) => obj.id);

        const new_peers = [...new Set([...instance.peers, ...selected_peers])];
        await InstancesAPI.update(instance.id, { peers: new_peers });

        fetchPeers();
        addToast({
          id: instancesPeerToAssociate,
          title: i18n._(msg`Peers update on ${instance.hostname}.  Please be sure to run the install bundle for ${instance.hostname} again in order to see changes take effect.`),
          variant: AlertVariant.success,
          hasTimeout: true,
        });
      },
      [instance, fetchPeers, addToast, i18n]
    )
  );

  const {
    isLoading: isDisassociateLoading,
    request: handlePeersDiassociate,
    error: disassociateError,
  } = useRequest(
    useCallback(async () => {
      let new_peers = instance.peers;

      const selected_ids = selected.map((obj) => obj.id);

      for (let i = 0; i < selected_ids.length; i++) {
        new_peers = new_peers.filter((s_id) => s_id !== selected_ids[i]);
      }
      await InstancesAPI.update(instance.id, { peers: new_peers });

      fetchPeers();
      addToast({
        title: i18n._(msg`Peer removed. Please be sure to run the install bundle for ${instance.hostname} again in order to see changes take effect.`),
        variant: AlertVariant.success,
        hasTimeout: true,
      });
    }, [instance, selected, fetchPeers, addToast, i18n])
  );

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  const isHopNode = instance.node_type === 'hop';
  const isExecutionNode = instance.node_type === 'execution';

  return (
    <CardBody>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={
          isLoading || isDisassociateLoading || isAssociateLoading
        }
        items={peers}
        itemCount={count}
        pluralizedItemName={i18n._(msg`Peers`)}
        qsConfig={QS_CONFIG}
        onRowClick={handleSelect}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        toolbarSearchColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'hostname__icontains',
            isDefault: true,
          },
        ]}
        toolbarSortColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'hostname',
          },
        ]}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isExpandable>
            <HeaderCell
              tooltip={i18n._(msg`Cannot run health check on hop nodes.`)}
              sortKey="hostname"
            >{i18n._(msg`Instance Name`)}</HeaderCell>
            <HeaderCell sortKey="address">{i18n._(msg`Address`)}</HeaderCell>
            <HeaderCell sortKey="port">{i18n._(msg`Port`)}</HeaderCell>
            <HeaderCell sortKey="node_type">{i18n._(msg`Node Type`)}</HeaderCell>
            <HeaderCell sortKey="canonical">{i18n._(msg`Canonical`)}</HeaderCell>
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
            additionalControls={[
              (isExecutionNode || isHopNode) && (
                <ToolbarAddButton
                  ouiaId="add-instance-peers-button"
                  key="associate"
                  defaultLabel={i18n._(msg`Associate`)}
                  onClick={() => setIsModalOpen(true)}
                />
              ),
              (isExecutionNode || isHopNode) && (
                <DisassociateButton
                  verifyCannotDisassociate={false}
                  key="disassociate"
                  onDisassociate={handlePeersDiassociate}
                  itemsToDisassociate={selected}
                  modalTitle={i18n._(msg`Remove peers?`)}
                />
              ),
            ]}
          />
        )}
        renderRow={(peer, index) => (
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
          header={i18n._(msg`Instances`)}
          fetchRequest={fetchPeersToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handlePeerAssociate}
          onClose={() => setIsModalOpen(false)}
          title={i18n._(msg`Select Peer Addresses`)}
          optionsRequest={readInstancesOptions}
          displayKey="address"
          columns={[
            { key: 'hostname', name: i18n._(msg`Name`) },
            { key: 'address', name: i18n._(msg`Address`) },
            { key: 'port', name: i18n._(msg`Port`) },
            { key: 'node_type', name: i18n._(msg`Node Type`) },
            { key: 'protocol', name: i18n._(msg`Protocol`) },
          ]}
        />
      )}
      <Toast {...toastProps} />
      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={i18n._(msg`Error!`)}
          variant="error"
        >
          {associateError && i18n._(msg`Failed to associate peer.`)}
          {disassociateError && i18n._(msg`Failed to remove peers.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default InstancePeerList;
