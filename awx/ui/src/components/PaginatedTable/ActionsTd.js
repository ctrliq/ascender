import React from 'react';
import { Td } from '@patternfly/react-table';
import styled, { css } from 'styled-components';

const ActionsGrid = styled.div`
  display: grid;
  grid-gap: 16px;
  align-items: center;
  padding-right: 20px
    ${(props) => {
      const columns =
        props.$gridColumns || '40px '.repeat(props.$numActions || 1);
      return css`
        grid-template-columns: ${columns};
      `;
    }};
`;
ActionsGrid.displayName = 'ActionsGrid';

const ActionsCell = styled(Td)`
  text-align: right;
  --pf-c-table--cell--Width: ${(props) => props.$width}px;

  [role='presentation'] {
    color: var(--pf-global--Color--300);
    opacity: 0.5;
  }

  &:hover [role='presentation'] {
    opacity: 1;
  }
`;
ActionsCell.displayName = 'ActionsCell';

export default function ActionsTd({ children, gridColumns, ...props }) {
  const numActions = children.length || 1;
  const width = numActions * 40;
  return (
    <ActionsCell $width={width} {...props}>
      <ActionsGrid $numActions={numActions} $gridColumns={gridColumns}>
        {React.Children.map(children, (child, i) =>
          child
            ? React.cloneElement(child, {
                column: i + 1,
              })
            : null
        )}
      </ActionsGrid>
    </ActionsCell>
  );
}
