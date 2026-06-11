import React from 'react';
import styled from 'styled-components';
import { Tooltip } from '@patternfly/react-core';

const ColumnItem = styled.div`
  grid-column: ${(props) => props.$column};
`;
ColumnItem.displayName = 'ColumnItem';

export default function ActionItem({ column, tooltip, visible, children }) {
  if (!visible) {
    return null;
  }

  return (
    <ColumnItem $column={column}>
      {tooltip ? (
        <Tooltip content={tooltip} position="top">
          <div>{children}</div>
        </Tooltip>
      ) : (
        children
      )}
    </ColumnItem>
  );
}
