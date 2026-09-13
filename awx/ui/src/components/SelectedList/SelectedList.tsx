import type { SelectableOption } from 'types/api';
import React from 'react';
import { Label, Split as PFSplit, SplitItem } from '@patternfly/react-core';

import styled from 'styled-components';
import ChipGroup from '../ChipGroup';

const Split = styled(PFSplit)`
  margin: 20px 0 5px 0 !important;
  align-items: baseline;
`;

const SplitLabelItem = styled(SplitItem)`
  font-weight: bold;
  margin-right: 32px;
  word-break: initial;
`;

/**
 * What a chip renderer is handed for one selected item.
 *
 * A callback's argument rather than a component's props, which the prop-types
 * rule below cannot tell apart.
 */
/* eslint-disable react/no-unused-prop-types */
export interface SelectedItemChip<
  T extends SelectableOption = SelectableOption,
> {
  item: T;
  removeItem: (item: T) => void;
  canDelete: boolean;
}
/* eslint-enable react/no-unused-prop-types */

export interface SelectedListProps<
  T extends SelectableOption = SelectableOption,
> {
  label?: React.ReactNode;
  selected: T[];
  onRemove?: (item: T) => void;
  displayKey?: string;
  isReadOnly?: boolean;
  /**
   * Lets a caller render its own chip per item, a credential chip say.
   * Declared as a method so it stays bivariant: a lookup passes the same one
   * down that it was given, typed by the rows the lookup holds.
   */
  renderItemChip?(props: SelectedItemChip<T>): React.ReactNode;
}

// Generic in the row, so a caller that holds its own type gets it back in the
// chip renderer rather than the widest thing a list can hold.
function SelectedList<T extends SelectableOption = SelectableOption>({
  label = 'Selected',
  selected,
  onRemove = () => null,
  displayKey = 'name',
  isReadOnly = false,
  renderItemChip,
}: SelectedListProps<T>) {
  const renderChip =
    renderItemChip ||
    (({ item, removeItem }: SelectedItemChip<T>) => (
      <Label variant="outline" key={item.id} onClose={() => removeItem(item)}>
        {item[displayKey] as React.ReactNode}
      </Label>
    ));

  return (
    <Split>
      <SplitLabelItem>{label}</SplitLabelItem>
      <SplitItem>
        <ChipGroup
          numChips={5}
          totalChips={selected?.length ?? 0}
          ouiaId="selected-list-chips"
        >
          {selected.map((item) =>
            renderChip({
              item,
              removeItem: () => onRemove(item),
              canDelete: !isReadOnly,
            })
          )}
        </ChipGroup>
      </SplitItem>
    </Split>
  );
}

export default SelectedList;
