import type { SelectableOption } from 'types/api';
import React, { useId, useRef, useState } from 'react';
import {
  Button,
  DataList,
  DataListAction,
  DataListControl,
  DataListDragButton,
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

/** Moves one entry within a copy of the list, leaving the original alone. */
function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0) {
    return items;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved as T);
  return reordered;
}

export interface DraggableSelectedListProps<
  T extends SelectableOption = SelectableOption,
> {
  selected?: T[];
  /** Method style so a lookup can hand over its own narrower handler. */
  onRemove?(item?: T): void;
  /**
   * Hands back the whole list in its new order once a drag settles. A caller
   * that passes none gets the rows without a drag handle.
   */
  onRowDrag?(items: T[]): void;
}

// Generic in the row for the same reason SelectedList is: a lookup that names
// its own type gets it back in the remove handler.
function DraggableSelectedList<T extends SelectableOption = SelectableOption>({
  selected = [],
  onRemove = () => null,
  onRowDrag,
}: DraggableSelectedListProps<T>) {
  const { t } = useLingui();
  // aria-describedby takes an id, so the instructions are rendered once below
  // and every handle points at them.
  const instructionsId = useId();
  /**
   * The order being dragged into place. Null the rest of the time, so the rows
   * follow `selected` until a drag has something of its own to say.
   */
  const [dragOrder, setDragOrder] = useState<T[] | null>(null);
  /** The row being moved, by name, whether by pointer or by keyboard. */
  const [draggedName, setDraggedName] = useState<string | null>(null);
  /** Set while the keyboard holds a row, which the arrow keys then move. */
  const [isKeyboardDragging, setIsKeyboardDragging] = useState(false);
  // Announced to a screen reader, which cannot see the rows move.
  const [liveText, setLiveText] = useState('');
  /**
   * Whether the pointer let go over the list. Read by onDragEnd, which fires
   * after onDrop however the drag ended and cannot tell on its own.
   */
  const dropped = useRef(false);

  const items = dragOrder ?? selected;
  const names = items.map(nameOf);
  // One row cannot be reordered, and neither can a list nobody is listening to.
  const isDragDisabled = !onRowDrag || selected.length === 1;

  const indexOfName = (name: string | null) =>
    name === null ? -1 : names.indexOf(name);

  const commit = (order: T[]) => {
    onRowDrag?.(order);
    setDragOrder(null);
    setDraggedName(null);
    setIsKeyboardDragging(false);
  };

  const cancel = () => {
    setDragOrder(null);
    setDraggedName(null);
    setIsKeyboardDragging(false);
  };

  const onDragStart = (event: React.DragEvent<HTMLLIElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    // Firefox starts no drag at all unless the transfer carries something.
    event.dataTransfer.setData('text/plain', event.currentTarget.id);
    dropped.current = false;
    setDraggedName(event.currentTarget.id);
    setDragOrder(items);
    setLiveText(t`Dragging started for ${event.currentTarget.id}.`);
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    const row = (event.target as HTMLElement).closest('li');
    const from = indexOfName(draggedName);
    if (!row || from === -1) {
      return;
    }
    const to = names.indexOf(row.id);
    if (to === -1 || to === from) {
      return;
    }
    setDragOrder(moveItem(items, from, to));
    setLiveText(t`${draggedName} is now at position ${to + 1}.`);
  };

  // Only ever fires on a row of this list, because dragOver above is the only
  // thing that makes one a drop target. A drag let go anywhere else reaches
  // onDragEnd instead, which puts the order back.
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dropped.current = true;
    setLiveText(t`Dragging finished.`);
    commit(items);
  };

  // Fires however the drag ended, so it is where a row let go outside the list
  // puts the order back the way it was.
  const onDragEnd = () => {
    if (dropped.current) {
      return;
    }
    setLiveText(t`Dragging cancelled. The list is unchanged.`);
    cancel();
  };

  /**
   * Space or enter picks a row up and puts it down again; while it is held the
   * arrow keys move it, and escape puts it back where it started.
   */
  const onDragKeyDown = (event: React.KeyboardEvent, name: string) => {
    if (isDragDisabled) {
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (isKeyboardDragging) {
        setLiveText(t`Dragging finished.`);
        commit(items);
        return;
      }
      setDraggedName(name);
      setDragOrder(items);
      setIsKeyboardDragging(true);
      setLiveText(
        t`Dragging started for ${name}. Use the arrow keys to move it.`
      );
      return;
    }
    if (!isKeyboardDragging) {
      return;
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      setLiveText(t`Dragging cancelled. The list is unchanged.`);
      cancel();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const from = indexOfName(draggedName);
      const to = event.key === 'ArrowUp' ? from - 1 : from + 1;
      if (from === -1 || to < 0 || to >= items.length) {
        return;
      }
      setDragOrder(moveItem(items, from, to));
      setLiveText(t`${name} is now at position ${to + 1}.`);
    }
  };

  const removeItem = (name: string) => {
    onRemove(selected.find((i) => nameOf(i) === name));
  };

  if (selected.length <= 0) {
    return null;
  }

  return (
    <>
      <DataList
        aria-label={
          onRowDrag
            ? t`Draggable list to reorder and remove selected items.`
            : t`Selected items list.`
        }
        data-cy="draggable-list"
        onDragOver={onDragOver}
      >
        {names.map((label, index) => {
          const rowPosition = index + 1;
          return (
            <DataListItem
              id={label}
              key={label}
              draggable={!isDragDisabled}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              aria-pressed={draggedName === label}
            >
              <DataListItemRow>
                {onRowDrag && (
                  <DataListControl>
                    <DataListDragButton
                      // Named per row rather than labelled by it: three
                      // handles called "Reorder" say nothing about which
                      // row each one moves.
                      aria-label={t`Reorder ${label}`}
                      aria-describedby={instructionsId}
                      aria-pressed={isKeyboardDragging && draggedName === label}
                      data-cy={`reorder-${label}`}
                      isDisabled={isDragDisabled}
                      onKeyDown={(event) => onDragKeyDown(event, label)}
                    />
                  </DataListControl>
                )}
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
                    isDisabled={draggedName !== null}
                  />
                </RemoveActionSection>
              </DataListItemRow>
            </DataListItem>
          );
        })}
      </DataList>
      {onRowDrag && (
        <div id={instructionsId} className="pf-v6-screen-reader">
          {t`Press space or enter to begin dragging, and use the arrow keys to move the row up or down. Press space or enter again to confirm, or escape to cancel.`}
        </div>
      )}
      <div className="pf-v6-screen-reader" aria-live="assertive">
        {liveText}
      </div>
    </>
  );
}

export default DraggableSelectedList;
