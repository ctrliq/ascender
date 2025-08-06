import React, { useCallback, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import styled from 'styled-components';
import { Alert } from '@patternfly/react-core';
import { InventoriesAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import OptionsList from '../../OptionsList';
import ContentLoading from '../../ContentLoading';
import ContentError from '../../ContentError';

const InventoryErrorAlert = styled(Alert)`
  margin-bottom: 20px;
`;

const QS_CONFIG = getQSConfig('inventory', {
  page: 1,
  page_size: 5,
  order_by: 'name',
  role_level: 'use_role',
});

function InventoryStep({ warningMessage = null }) {
  const { i18n } = useLingui();
  const [field, meta, helpers] = useField('inventory');

  const history = useHistory();

  const {
    isLoading,
    error,
    result: { inventories, count, relatedSearchableKeys, searchableKeys },
    request: fetchInventories,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, history.location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        InventoriesAPI.read(params),
        InventoriesAPI.readOptions(),
      ]);
      return {
        inventories: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [history.location]),
    {
      count: 0,
      inventories: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchInventories();
  }, [fetchInventories]);

  if (isLoading) {
    return <ContentLoading />;
  }
  if (error) {
    return <ContentError error={error} />;
  }

  return (
    <div data-cy="inventory-prompt">
      {meta.touched && meta.error && (
        <InventoryErrorAlert variant="danger" isInline title={meta.error} />
      )}
      {warningMessage}
      <OptionsList
        value={field.value ? [field.value] : []}
        options={inventories}
        optionCount={count}
        searchColumns={[
          {
            name: i18n._(t`Name`),
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: i18n._(t`Created By (Username)`),
            key: 'created_by__username__icontains',
          },
          {
            name: i18n._(t`Modified By (Username)`),
            key: 'modified_by__username__icontains',
          },
        ]}
        sortColumns={[
          {
            name: i18n._(t`Name`),
            key: 'name',
          },
        ]}
        searchableKeys={searchableKeys}
        relatedSearchableKeys={relatedSearchableKeys}
        header={i18n._(t`Inventory`)}
        name="inventory"
        qsConfig={QS_CONFIG}
        readOnly
        selectItem={helpers.setValue}
        deselectItem={() => field.onChange(null)}
      />
    </div>
  );
}

export default InventoryStep;
