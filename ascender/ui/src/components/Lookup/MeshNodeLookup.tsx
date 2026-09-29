import type { Instance, SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { FormGroup } from '@patternfly/react-core';

import { InstancesAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useRequest from 'hooks/useRequest';
import Popover from '../Popover';
import OptionsList from '../OptionsList';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('mesh_nodes', {
  page: 1,
  page_size: 5,
  order_by: 'hostname',
});

// Only hop nodes can run the pods of a container group.
const HOP_NODES = { node_type: 'hop' };

/** The lookup shows an item by its name, and an instance only has a hostname. */
const asItem = (instance: Partial<Instance>): SummaryFieldRef => ({
  ...instance,
  id: instance.id as number,
  name: instance.hostname,
});

export interface MeshNodeLookupProps {
  id?: string;
  label?: React.ReactNode;
  tooltip?: React.ReactNode;
  value?: SummaryFieldRef | null;
  /** Declared method style so a caller may name its own row type. */
  onChange(value: SummaryFieldRef | null): void;
  onBlur?(event?: React.SyntheticEvent): void;
  [key: string]: unknown;
}

function MeshNodeLookup({
  id = 'mesh-node',
  label,
  tooltip,
  value,
  onChange,
  onBlur,
}: MeshNodeLookupProps) {
  const { t } = useLingui();
  const location = useLocation();
  const {
    result: { nodes, count, relatedSearchableKeys, searchableKeys },
    request: fetchNodes,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        InstancesAPI.read(mergeParams(params, HOP_NODES)),
        InstancesAPI.readOptions(),
      ]);
      return {
        nodes: data.results.map(asItem),
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      nodes: [] as SummaryFieldRef[],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const checkHostname = useCallback(
    async (hostname: string) => {
      if (!hostname) {
        onChange(null);
        return;
      }
      try {
        const {
          data: { results },
        } = await InstancesAPI.read({ ...HOP_NODES, hostname });
        onChange(results[0] ? asItem(results[0]) : null);
      } catch {
        onChange(null);
      }
    },
    [onChange]
  );

  return (
    <FormGroup
      fieldId={id}
      label={label}
      labelHelp={tooltip ? <Popover content={tooltip} /> : undefined}
    >
      <Lookup
        id={id}
        header={t`Mesh node`}
        value={value}
        onBlur={onBlur}
        onChange={onChange}
        onUpdate={fetchNodes}
        onDebounce={checkHostname}
        fieldName="mesh_node"
        qsConfig={QS_CONFIG}
        isLoading={isLoading}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={nodes}
            optionCount={count}
            header={t`Mesh node`}
            displayKey="hostname"
            searchColumns={[
              {
                name: t`Hostname`,
                key: 'hostname__icontains',
                isDefault: true,
              },
            ]}
            sortColumns={[
              {
                name: t`Hostname`,
                key: 'hostname',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            multiple={state.multiple}
            name="meshNodes"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item: LookupItem) =>
              dispatch({ type: 'SELECT_ITEM', item })
            }
            deselectItem={(item: LookupItem) =>
              dispatch({ type: 'DESELECT_ITEM', item })
            }
          />
        )}
      />
      <LookupErrorMessage error={error} />
    </FormGroup>
  );
}

export default MeshNodeLookup;
