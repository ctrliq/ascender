import React from 'react';
import { Td } from '@patternfly/react-table';
import styled from 'styled-components';

const ActionsGrid = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: flex-end;
  padding-right: 20px;
`;
ActionsGrid.displayName = 'ActionsGrid';

const ActionsCell = styled(Td)`
  text-align: right;
  --pf-v6-c-table--cell--Width: ${(props) => props.$width}px;

  [role='presentation'] {
    color: var(--pf-v6-global--Color--300);
    opacity: 0.5;
  }

  &:hover [role='presentation'] {
    opacity: 1;
  }
`;
ActionsCell.displayName = 'ActionsCell';

export default function ActionsTd({ children, gridColumns: _gridColumns, ...props }) {
  const numActions = children.length || 1;
  const width = numActions * 40;
  return (
    <ActionsCell $width={width} {...props}>
      <ActionsGrid>
        {children}
      </ActionsGrid>
    </ActionsCell>
  );
}
