import type { SearchColumn, SortColumn, Untyped } from 'types/api';
import React from 'react';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import { SelectedList, DraggableSelectedList } from '../SelectedList';
import CheckboxListItem from '../CheckboxListItem';
import DataListToolbar from '../DataListToolbar';
import PaginatedTable, { HeaderCell, HeaderRow } from '../PaginatedTable';

const ModalList = styled.div`
  .pf-v6-c-toolbar__content {
    padding: 0 !important;
  }
`;

export interface OptionsListProps {
  columns?: Untyped;
  contentError?: unknown;
  deselectItem: Untyped;
  displayKey?: Untyped;
  header?: Untyped;
  isLoading?: boolean;
  isSelectedDraggable?: boolean;
  multiple?: boolean;
  name?: unknown;
  optionCount: Untyped;
  options: Untyped;
  qsConfig: Untyped;
  readOnly?: boolean;
  relatedSearchableKeys?: Untyped;
  renderItemChip?: Untyped;
  searchColumns?: SearchColumn[];
  searchableKeys?: Untyped;
  selectItem: Untyped;
  sortColumns?: SortColumn[];
  sortSelectedItems?: Untyped;
  value: Untyped;
  [key: string]: unknown;
}

function OptionsList({
  columns,
  contentError,
  deselectItem,
  displayKey = 'name',
  header,
  isLoading,
  isSelectedDraggable = false,
  multiple = false,
  name,
  optionCount,
  options,
  qsConfig,
  readOnly,
  relatedSearchableKeys,
  renderItemChip,
  searchColumns = [],
  searchableKeys,
  selectItem,
  sortColumns = [],
  sortSelectedItems,
  value,
}: OptionsListProps) {
  const { t } = useLingui();
  const buildHeaderRow = (
    <HeaderRow qsConfig={qsConfig}>
      {columns?.length > 0 ? (
        columns.map((col: Untyped) => (
          <HeaderCell key={col.key} sortKey={col.key}>
            {col.name}
          </HeaderCell>
        ))
      ) : (
        <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
      )}
    </HeaderRow>
  );
  let selectionPreview = null;
  if (value.length > 0) {
    if (isSelectedDraggable) {
      selectionPreview = (
        <DraggableSelectedList
          onRemove={deselectItem}
          onRowDrag={sortSelectedItems}
          selected={value}
        />
      );
    } else {
      selectionPreview = (
        <SelectedList
          label={t`Selected`}
          selected={value}
          onRemove={(item) => deselectItem(item)}
          isReadOnly={readOnly}
          renderItemChip={renderItemChip}
          displayKey={displayKey}
        />
      );
    }
  }

  return (
    <ModalList>
      {selectionPreview}
      <PaginatedTable
        contentError={contentError}
        items={options}
        itemCount={optionCount}
        pluralizedItemName={header}
        qsConfig={qsConfig}
        toolbarSearchColumns={searchColumns}
        toolbarSortColumns={sortColumns}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        hasContentLoading={isLoading}
        headerRow={buildHeaderRow}
        onRowClick={selectItem}
        renderRow={(item: Untyped, index: number) => (
          <CheckboxListItem
            key={item.id}
            rowIndex={index}
            itemId={item.id}
            name={multiple ? item[displayKey] : name}
            label={item[displayKey]}
            columns={columns}
            item={item}
            isSelected={value.some((i: Untyped) => i.id === item.id)}
            onSelect={() => selectItem(item)}
            onDeselect={() => deselectItem(item)}
            isRadio={!multiple}
          />
        )}
        renderToolbar={(props) => <DataListToolbar {...props} fillWidth />}
        showPageSizeOptions={false}
      />
    </ModalList>
  );
}

export default OptionsList;
