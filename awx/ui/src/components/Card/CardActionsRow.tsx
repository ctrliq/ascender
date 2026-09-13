import React from 'react';
import styled from 'styled-components';

const CardActionsWrapper = styled.div`
  margin-top: var(--pf-v6-global--spacer--xl);
  display: flex;
  align-items: center;
  gap: var(--pf-v6-global--spacer--sm);
`;

export interface CardActionsRowProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function CardActionsRow({ children }: CardActionsRowProps) {
  return <CardActionsWrapper>{children}</CardActionsWrapper>;
}

export default CardActionsRow;
