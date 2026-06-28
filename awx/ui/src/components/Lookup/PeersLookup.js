import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
	Label, FormGroup
} from '@patternfly/react-core';

import { InstancesAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useRequest from 'hooks/useRequest';
import Popover from '../Popover';
import OptionsList from '../OptionsList';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import FieldWithPrompt from '../FieldWithPrompt';

const QS_CONFIG = getQSConfig('instances', {
  page: 1,
  page_size: 5,
  order_by: 'hostname',
});

const defaultInstanceDetails = {};

function PeersLookup({
  id = 'instances',
  value,
  onChange,
  tooltip = '',
  className = '',
  required = false,
  fieldName = 'instances',
  multiple = true,
  validate = () => undefined,
  columns = undefined,
  isPromptableField,
  promptId,
  promptName,
  formLabel = undefined,
  typePeers = false,
  instance_details = defaultInstanceDetails,
}) {
  const location = useLocation();
  const { t } = useLingui();
  const {
    result: { instances, count, relatedSearchableKeys, searchableKeys },
    request: fetchInstances,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const peersFilter = {};
      if (typePeers) {
        peersFilter.not__node_type = ['control', 'hybrid'];
        if (instance_details) {
          if (instance_details.id) {
            peersFilter.not__id = instance_details.id;
            peersFilter.not__hostname = instance_details.peers;
          }
        }
      }

      const [{ data }, actionsResponse] = await Promise.all([
        InstancesAPI.read(
          mergeParams(params, {
            ...peersFilter,
          })
        ),
        InstancesAPI.readOptions(),
      ]);
      return {
        instances: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location, typePeers, instance_details]),
    {
      instances: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const renderLookup = () => (
    <>
      <Lookup
        id={fieldName}
        header={formLabel}
        value={value}
        onChange={onChange}
        onUpdate={fetchInstances}
        fieldName={fieldName}
        validate={validate}
        qsConfig={QS_CONFIG}
        multiple={multiple}
        required={required}
        isLoading={isLoading}
        label={formLabel}
        renderItemChip={({ item, removeItem }) => (
          <Label variant="outline"
            key={item.id}
            onClose={() => removeItem(item)}

          >
            {item.hostname}
          </Label>
        )}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={instances}
            optionCount={count}
            columns={columns}
            header={formLabel}
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
            multiple={multiple}
            label={formLabel}
            name={fieldName}
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item) => dispatch({ type: 'SELECT_ITEM', item })}
            deselectItem={(item) => dispatch({ type: 'DESELECT_ITEM', item })}
          />
        )}
      />
      <LookupErrorMessage error={error} />
    </>
  );

  return isPromptableField ? (
    <FieldWithPrompt
      fieldId={id}
      label={formLabel}
      promptId={promptId}
      promptName={promptName}
      tooltip={tooltip}
    >
      {renderLookup()}
    </FieldWithPrompt>
  ) : (
    <FormGroup
      className={className}
      label={formLabel}
      labelHelp={tooltip && <Popover content={tooltip} />}
      fieldId={id}
    >
      {renderLookup()}
    </FormGroup>
  );
}

export default PeersLookup;
