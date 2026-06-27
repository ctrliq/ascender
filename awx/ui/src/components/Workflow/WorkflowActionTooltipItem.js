import React from 'react';
import styled from 'styled-components';

const TooltipItem = styled.div`
  align-items: center;
  border-radius: 2px;
  cursor: pointer;
  display: flex;
  font-size: 12px;
  height: 25px;
  justify-content: center;
  width: 25px;

  &:hover {
    color: var(--pf-v6-global--Color--100);
    background-color: var(--pf-v6-global--BackgroundColor--200);
  }

  &:not(:last-of-type) {
    margin-bottom: 5px;
  }
`;

function WorkflowActionTooltipItem({
  children,
  id,
  onClick = () => {},
  onMouseEnter = () => {},
  onMouseLeave = () => {},
}) {
  return (
    <TooltipItem
      id={id}
      data-cy={id}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </TooltipItem>
  );
}

export default WorkflowActionTooltipItem;
