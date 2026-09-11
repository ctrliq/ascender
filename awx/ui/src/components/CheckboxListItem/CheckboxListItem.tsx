import type { SearchColumn, Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Td, Tr } from '@patternfly/react-table';
import { ActionsTd } from 'components/PaginatedTable';

export interface CheckboxListItemProps {
  isRadio?: boolean;
  isSelected?: boolean;
  itemId: number | string;
  label: React.ReactNode;
  name: Untyped;
  onDeselect: (...args: Untyped[]) => void;
  rowIndex: number;
  onSelect: (...args: Untyped[]) => void;
  /** One column per field to show beside the checkbox, keyed into `item`. */
  columns?: SearchColumn[];
  item?: Untyped;
  /** Elements rendered in the row's actions cell; each carries its own id. */
  rowActions?: React.ReactElement<{ id: string }>[];
  [key: string]: unknown;
}

const CheckboxListItem = ({
  isRadio = false,
  isSelected = false,
  itemId,
  label,
  name,
  onDeselect,
  rowIndex,
  onSelect,
  columns,
  item,
  rowActions,
}: CheckboxListItemProps) => {
  const handleRowClick = () => {
    if (isSelected && !isRadio) {
      onDeselect(itemId);
    } else {
      onSelect(itemId);
    }
  };
  const { t } = useLingui();

  return (
    <Tr
      ouiaId={`list-item-${itemId}`}
      id={`list-item-${itemId}`}
      onClick={handleRowClick}
      css="cursor: default"
    >
      <Td
        id={`check-action-item-${itemId}`}
        select={{
          rowIndex,
          isSelected,
          variant: isRadio ? 'radio' : 'checkbox',
        }}
        name={name}
        dataLabel={t`Selected`}
      />

      {columns && columns.length > 0 ? (
        columns.map((col) => (
          <Td
            aria-label={col.name}
            data-cy={`item-${itemId}-${col.name}`}
            dataLabel={col.key}
            key={col.key}
          >
            {item?.[col.key]}
          </Td>
        ))
      ) : (
        <Td
          aria-labelledby={String(itemId)}
          data-cy={`item-${itemId}`}
          dataLabel={String(label)}
        >
          <b>{label}</b>
        </Td>
      )}
      {rowActions && (
        <ActionsTd>
          {rowActions.map((rowAction) => {
            const {
              props: { id },
            } = rowAction;
            return <React.Fragment key={id}>{rowAction}</React.Fragment>;
          })}
        </ActionsTd>
      )}
    </Tr>
  );
};

export default CheckboxListItem;
