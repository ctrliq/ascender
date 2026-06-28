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
  renderItemChip = null,
  searchColumns = [],
  searchableKeys,
  selectItem,
  sortColumns = [],
  sortSelectedItems,
  value,
}) {
  const { t } = useLingui();
  const buildHeaderRow = (
    <HeaderRow qsConfig={qsConfig}>
      {columns?.length > 0 ? (
        columns.map((col) => (
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
        renderRow={(item, index) => (
          <CheckboxListItem
            key={item.id}
            rowIndex={index}
            itemId={item.id}
            name={multiple ? item[displayKey] : name}
            label={item[displayKey]}
            columns={columns}
            item={item}
            isSelected={value.some((i) => i.id === item.id)}
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
