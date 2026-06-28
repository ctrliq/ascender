import React from 'react';
import {
	Label, Split as PFSplit,
	SplitItem
} from '@patternfly/react-core';

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

function SelectedList({
  label = 'Selected',
  selected,
  onRemove = () => null,
  displayKey = 'name',
  isReadOnly = false,
  renderItemChip = null,
}) {
  const renderChip =
    renderItemChip ||
    (({ item, removeItem }) => (
      <Label variant="outline" key={item.id} onClose={removeItem} >
        {item[displayKey]}
      </Label>
    ));

  return (
    <Split>
      <SplitLabelItem>{label}</SplitLabelItem>
      <SplitItem>
        <ChipGroup
          numChips={5}
          totalChips={selected.length}
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
