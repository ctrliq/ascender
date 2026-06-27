import React from 'react';
import styled from 'styled-components';

const CardActionsWrapper = styled.div`
  margin-top: var(--pf-v6-global--spacer--xl);
  display: flex;
  align-items: center;
  gap: var(--pf-v6-global--spacer--sm);
`;

function CardActionsRow({ children }) {
  return <CardActionsWrapper>{children}</CardActionsWrapper>;
}

export default CardActionsRow;
