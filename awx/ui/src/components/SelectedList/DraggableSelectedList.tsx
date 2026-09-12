import type { SelectableOption } from 'types/api';
import React from 'react';
import {
  Button,
  DataList,
  DataListAction,
  DataListItem,
  DataListCell,
  DataListItemRow,
  DataListItemCells,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';

/** The list numbers what it shows, so every row needs a label to number. */
const nameOf = (item: SelectableOption) => String(item?.name ?? '');

const RemoveActionSection = styled(DataListAction)`
  && {
    align-items: center;
    padding: 0;
  }
`;

export interface DraggableSelectedListProps<
  T extends SelectableOption = SelectableOption,
> {
  selected?: T[];
  /** Method style so a lookup can hand over its own narrower handler. */
  onRemove?(item?: T): void;
}

// Generic in the row for the same reason SelectedList is: a lookup that names
// its own type gets it back in the remove handler.
function DraggableSelectedList<T extends SelectableOption = SelectableOption>({
  selected = [],
  onRemove = () => null,
}: DraggableSelectedListProps<T>) {
  const { t } = useLingui();

  const removeItem = (name: string) => {
    onRemove(selected.find((i) => nameOf(i) === name));
  };

  if (selected.length <= 0) {
    return null;
  }

  const orderedList = selected.map(nameOf);

  return (
    <DataList aria-label={t`Selected items list.`} data-cy="draggable-list">
      {orderedList.map((label, index) => {
        const rowPosition = index + 1;
        return (
          <DataListItem id={label} key={rowPosition}>
            <DataListItemRow>
              <DataListItemCells
                dataListCells={[
                  <DataListCell key={label}>
                    <span id={`draggable-item-${rowPosition}`}>
                      {`${rowPosition}. ${label}`}
                    </span>
                  </DataListCell>,
                ]}
              />
              <RemoveActionSection
                aria-label={t`Actions`}
                id={`draggable-item-actions-${rowPosition}`}
                aria-labelledby={`draggable-item-${rowPosition}`}
              >
                <Button
                  icon={<TimesIcon />}
                  onClick={() => removeItem(label)}
                  variant="plain"
                  aria-label={t`Remove`}
                  ouiaId={`draggable-list-remove-${label}`}
                />
              </RemoveActionSection>
            </DataListItemRow>
          </DataListItem>
        );
      })}
    </DataList>
  );
}

export default DraggableSelectedList;
