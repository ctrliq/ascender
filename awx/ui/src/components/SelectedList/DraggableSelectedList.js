import React, { useState } from 'react';
import {
  Button,
  DataList,
  DataListAction,
  DataListItem,
  DataListCell,
  DataListItemRow,
  DataListControl,
  DataListDragButton,
  DataListItemCells,
} from '@patternfly/react-core';
import { TimesIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';

const RemoveActionSection = styled(DataListAction)`
  && {
    align-items: center;
    padding: 0;
  }
`;

function DraggableSelectedList({
  selected = [],
  onRemove = () => null,
}) {
  const { t } = useLingui();
  const [liveText] = useState('');
  const [isDragging] = useState(false);

  // TODO: PF5 removed DataList drag props; drag-and-drop needs @patternfly/react-drag-drop

  const removeItem = (item) => {
    onRemove(selected.find((i) => i.name === item));
  };

  if (selected.length <= 0) {
    return null;
  }

  const orderedList = selected.map((item) => item?.name);

  return (
    <>
      <DataList
        aria-label={t`Draggable list to reorder and remove selected items.`}
        data-cy="draggable-list"

      >
        {orderedList.map((label, index) => {
          const rowPosition = index + 1;
          return (
            <DataListItem id={label} key={rowPosition}>
              <DataListItemRow>
                <DataListControl>
                  <DataListDragButton
                    aria-label={t`Reorder`}
                    aria-labelledby={rowPosition}
                    aria-describedby={t`Press space or enter to begin dragging,
                    and use the arrow keys to navigate up or down.
                    Press enter to confirm the drag, or any other key to
                    cancel the drag operation.`}
                    aria-pressed="false"
                    data-cy={`reorder-${label}`}
                    isDisabled={selected.length === 1}
                  />
                </DataListControl>
                <DataListItemCells
                  dataListCells={[
                    <DataListCell key={label}>
                      <span id={rowPosition}>{`${rowPosition}. ${label}`}</span>
                    </DataListCell>,
                  ]}
                />
                <RemoveActionSection
                  aria-label={t`Actions`}
                  id={rowPosition}
                >
                  <Button
                    onClick={() => removeItem(label)}
                    variant="plain"
                    aria-label={t`Remove`}
                    ouiaId={`draggable-list-remove-${label}`}
                    isDisabled={isDragging}
                  >
                    <TimesIcon />
                  </Button>
                </RemoveActionSection>
              </DataListItemRow>
            </DataListItem>
          );
        })}
      </DataList>
      <div className="pf-v5-screen-reader" aria-live="assertive">
        {liveText}
      </div>
    </>
  );
}

export default DraggableSelectedList;
