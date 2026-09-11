import type {
  ApiEntity,
  OptionsResponse,
  Paginated,
  SearchColumn,
  SortColumn,
} from 'types/api';
import type { ApiResponse } from 'api/Base';
import type { QSParams } from 'util/qs';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import useRequest from 'hooks/useRequest';
import { getQSConfig, parseQueryString } from 'util/qs';
import DataListToolbar from '../DataListToolbar';
import CheckboxListItem from '../CheckboxListItem';
import { SelectedList } from '../SelectedList';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  getSearchableKeys,
} from '../PaginatedTable';

const QS_Config = (sortColumns: SortColumn[]) =>
  getQSConfig('resource', {
    page: 1,
    page_size: 5,
    order_by: `${
      sortColumns.filter((col) => col.key === 'name').length
        ? 'name'
        : 'username'
    }`,
  });
export interface SelectResourceStepProps {
  searchColumns?: SearchColumn[];
  sortColumns?: SortColumn[];
  displayKey?: string;
  onRowClick?: (item: ApiEntity) => void;
  /** What the chips above the list are labelled, in the plural. */
  selectedLabel?: string;
  selectedResourceRows?: ApiEntity[];
  fetchItems: (params: QSParams) => Promise<ApiResponse<Paginated<ApiEntity>>>;
  fetchOptions: () => Promise<ApiResponse<OptionsResponse>>;
  [key: string]: unknown;
}

function SelectResourceStep({
  searchColumns,
  sortColumns = [],
  displayKey = 'name',
  onRowClick = () => {},
  selectedLabel,
  selectedResourceRows = [],
  fetchItems,
  fetchOptions,
}: SelectResourceStepProps) {
  const location = useLocation();
  const { t } = useLingui();

  // Store stable references to fetchItems and fetchOptions
  const fetchItemsRef = React.useRef(fetchItems);
  const fetchOptionsRef = React.useRef(fetchOptions);

  const {
    isLoading,
    error,
    request: readResourceList,
    result: { resources, itemCount, relatedSearchableKeys, searchableKeys },
  } = useRequest(
    useCallback(async () => {
      const queryParams = parseQueryString(
        QS_Config(sortColumns),
        location.search
      );

      const [
        {
          data: { count, results },
        },
        actionsResponse,
      ] = await Promise.all([
        fetchItemsRef.current(queryParams),
        fetchOptionsRef.current(),
      ]);
      return {
        resources: results,
        itemCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location, sortColumns]),
    {
      resources: [],
      itemCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  // Remove readResourceList from deps, use location.search and sortColumns instead
  useEffect(() => {
    readResourceList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, JSON.stringify(sortColumns)]);

  return (
    <>
      <div>
        {t`Choose the resources that will be receiving new roles.  You'll be able to select the roles to apply in the next step.  Note that the resources chosen here will receive all roles chosen in the next step.`}
      </div>
      {selectedResourceRows.length > 0 && (
        <SelectedList
          displayKey={displayKey}
          label={selectedLabel}
          onRemove={onRowClick}
          selected={selectedResourceRows}
        />
      )}

      <PaginatedTable
        hasContentLoading={isLoading}
        contentError={error}
        items={resources}
        itemCount={itemCount}
        qsConfig={QS_Config(sortColumns)}
        onRowClick={onRowClick}
        toolbarSearchColumns={searchColumns}
        toolbarSortColumns={sortColumns}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_Config(sortColumns)}>
            {sortColumns.map(({ name, key }: SortColumn) => (
              <HeaderCell sortKey={key} key={key}>
                {name}
              </HeaderCell>
            ))}
          </HeaderRow>
        }
        renderRow={(item: ApiEntity, index: number) => (
          <CheckboxListItem
            isSelected={selectedResourceRows.some((i) => i.id === item.id)}
            itemId={item.id as number}
            item={item}
            rowIndex={index}
            key={item.id}
            columns={sortColumns}
            name={item[displayKey] as string}
            label={item[displayKey] as React.ReactNode}
            onSelect={() => onRowClick(item)}
            onDeselect={() => onRowClick(item)}
          />
        )}
        renderToolbar={(props) => <DataListToolbar {...props} fillWidth />}
        showPageSizeOptions={false}
      />
    </>
  );
}

export { SelectResourceStep as _SelectResourceStep };
export default SelectResourceStep;
