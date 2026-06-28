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

function DraggableSelectedList({
  selected = [],
  onRemove = () => null,
}) {
  const { t } = useLingui();

  const removeItem = (item) => {
    onRemove(selected.find((i) => i.name === item));
  };

  if (selected.length <= 0) {
    return null;
  }

  const orderedList = selected.map((item) => item?.name);

  return (
    <DataList
      aria-label={t`Selected items list.`}
      data-cy="draggable-list"
    >
      {orderedList.map((label, index) => {
        const rowPosition = index + 1;
        return (
          <DataListItem id={label} key={rowPosition}>
            <DataListItemRow>
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
                <Button icon={<TimesIcon />}
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
