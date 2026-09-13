import type { QSConfig } from 'util/qs';
import type { SearchableKey } from 'components/PaginatedTable';
import type {
  ApiEntity,
  SearchColumn,
  SelectableOption,
  SortColumn,
} from 'types/api';
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

/**
 * One option the list offers. Generic over it so a caller that hands in
 * credentials gets its handlers called back with credentials, rather than
 * with whatever the widest row type happens to be.
 */
export interface OptionsListProps<T extends SelectableOption = ApiEntity> {
  /** One column per field to show beside each row's checkbox. */
  columns?: SearchColumn[];
  contentError?: unknown;
  deselectItem: (item: T) => void;
  /** Which field of an option to show as its label; defaults to the name. */
  displayKey?: string;
  /** What the list is of, which names it in the table's own aria labels. */
  header?: string;
  isLoading?: boolean;
  isSelectedDraggable?: boolean;
  multiple?: boolean;
  name?: string;
  optionCount: number;
  options: T[];
  qsConfig: QSConfig;
  readOnly?: boolean;
  relatedSearchableKeys?: string[];
  /**
   * Declared as a method so the chip renderer stays bivariant: a lookup passes
   * the same one down that it was given, typed by the rows the lookup holds.
   */
  renderItemChip?(props: {
    item: T;
    removeItem: (item: T) => void;
    canDelete: boolean;
  }): React.ReactNode;
  searchColumns?: SearchColumn[];
  searchableKeys?: SearchableKey[];
  selectItem: (item: T) => void;
  sortColumns?: SortColumn[];
  /** Reorders the selected rows, where the caller lets them be dragged. */
  sortSelectedItems?: (items: T[]) => void;
  /** What is selected: one item, or several where multiple is set. */
  value: T[];
  [key: string]: unknown;
}

function OptionsList<T extends SelectableOption = ApiEntity>({
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
}: OptionsListProps<T>) {
  const { t } = useLingui();
  const buildHeaderRow = (
    <HeaderRow qsConfig={qsConfig}>
      {columns?.length ? (
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
        renderRow={(item: T, index: number) => (
          <CheckboxListItem
            key={item.id}
            rowIndex={index}
            itemId={item.id as number}
            name={(multiple ? item[displayKey] : name) as string}
            label={item[displayKey] as React.ReactNode}
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
