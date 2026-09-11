import type { Untyped } from 'types/api';
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

const RemoveActionSection = styled(DataListAction)`
  && {
    align-items: center;
    padding: 0;
  }
`;

export interface DraggableSelectedListProps {
  selected?: unknown[];
  onRemove?: (item?: Untyped) => void;
  [key: string]: unknown;
}

function DraggableSelectedList({
  selected = [],
  onRemove = () => null,
}: DraggableSelectedListProps) {
  const { t } = useLingui();

  const removeItem = (name: string) => {
    onRemove(selected.find((i: Untyped) => i.name === name));
  };

  if (selected.length <= 0) {
    return null;
  }

  const orderedList: string[] = selected.map((item: Untyped) => item?.name);

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
