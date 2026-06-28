import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { InventoriesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import useAutoPopulateLookup from 'hooks/useAutoPopulateLookup';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import Lookup from './Lookup';
import OptionsList from '../OptionsList';
import LookupErrorMessage from './shared/LookupErrorMessage';
import FieldWithPrompt from '../FieldWithPrompt';

const QS_CONFIG = getQSConfig('inventory', {
  page: 1,
  page_size: 5,
  order_by: 'name',
  role_level: 'use_role',
});

function InventoryLookup({
  autoPopulate = false,
  excludeIds = [],
  fieldId = 'inventory',
  fieldName = 'inventory',
  hideAdvancedInventories = false,
  isDisabled = false,
  isPromptableField,
  onBlur,
  onChange,
  promptId,
  promptName,
  required = false,
  validate = () => {},
  value = null,
  multiple,
}) {
  const location = useLocation();
  const { t } = useLingui();
  const autoPopulateLookup = useAutoPopulateLookup(onChange);

  const excludeIdsKey = (excludeIds || []).join(',');

  const {
    result: { inventories, count, relatedSearchableKeys, searchableKeys },
    request: fetchInventories,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const inventoryKindParams = hideAdvancedInventories
        ? { not__kind: ['smart', 'constructed', 'federated'] }
        : {};
      const excludeParams = excludeIdsKey
        ? { not__id__in: excludeIdsKey }
        : {};
      const [{ data }, actionsResponse] = await Promise.all([
        InventoriesAPI.read(
          mergeParams(params, {
            ...inventoryKindParams,
            ...excludeParams,
          })
        ),
        InventoriesAPI.readOptions(),
      ]);

      if (autoPopulate) {
        autoPopulateLookup(data.results);
      }

      return {
        inventories: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: Object.keys(actionsResponse.data.actions?.GET || {})
          .filter((key) => {
            if (
              ['kind', 'host_filter'].includes(key) &&
              hideAdvancedInventories
            ) {
              return false;
            }
            return actionsResponse.data.actions?.GET[key].filterable;
          })
          .map((key) => ({
            key,
            type: actionsResponse.data.actions?.GET[key].type,
          })),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPopulate, autoPopulateLookup, excludeIdsKey, location]),
    {
      inventories: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const checkInventoryName = useCallback(
    async (name) => {
      if (!name) {
        onChange(null);
        return;
      }

      try {
        const {
          data: { results: nameMatchResults, count: nameMatchCount },
        } = await InventoriesAPI.read({ name });
        onChange(nameMatchCount ? nameMatchResults[0] : null);
      } catch {
        onChange(null);
      }
    },
    [onChange]
  );

  useEffect(() => {
    fetchInventories();
  }, [fetchInventories]);

  return isPromptableField ? (
    <FieldWithPrompt
      fieldId={fieldId}
      isRequired={required}
      label={t`Inventory`}
      promptId={promptId}
      promptName={promptName}
      isDisabled={isDisabled}
      tooltip={t`Select the inventory containing the hosts
            you want this job to manage.`}
    >
      <Lookup
        id="inventory-lookup"
        header={t`Inventory`}
        value={value}
        onChange={onChange}
        onUpdate={fetchInventories}
        onBlur={onBlur}
        required={required}
        onDebounce={checkInventoryName}
        fieldName={fieldName}
        validate={validate}
        isLoading={isLoading}
        isDisabled={isDisabled}
        qsConfig={QS_CONFIG}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={inventories}
            optionCount={count}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
              {
                name: t`Modified By (Username)`,
                key: 'modified_by__username__icontains',
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            multiple={state.multiple}
            header={t`Inventory`}
            name="inventory"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item) => dispatch({ type: 'SELECT_ITEM', item })}
            deselectItem={(item) => dispatch({ type: 'DESELECT_ITEM', item })}
          />
        )}
      />
      <LookupErrorMessage error={error} />
    </FieldWithPrompt>
  ) : (
    <>
      <Lookup
        id="inventory-lookup"
        header={t`Inventory`}
        value={value}
        onChange={onChange}
        onDebounce={checkInventoryName}
        fieldName={fieldName}
        validate={validate}
        multiple={multiple}
        onBlur={onBlur}
        required={required}
        isLoading={isLoading}
        isDisabled={isDisabled}
        qsConfig={QS_CONFIG}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={inventories}
            optionCount={count}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
              {
                name: t`Modified By (Username)`,
                key: 'modified_by__username__icontains',
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            multiple={state.multiple}
            header={t`Inventory`}
            name="inventory"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item) => dispatch({ type: 'SELECT_ITEM', item })}
            deselectItem={(item) => dispatch({ type: 'DESELECT_ITEM', item })}
            sortSelectedItems={(selectedItems) =>
              dispatch({ type: 'SET_SELECTED_ITEMS', selectedItems })
            }
            isSelectedDraggable
          />
        )}
      />
      <LookupErrorMessage error={error} />
    </>
  );
}

export default InventoryLookup;
