import React from 'react';
import styled from 'styled-components';

const TooltipContents = styled.div`
  display: flex;
`;

const TooltipArrow = styled.div`
  width: 10px;
`;

const TooltipArrowOuter = styled.div`
  border-bottom: 10px solid transparent;
  border-right: 10px solid var(--pf-v6-global--BorderColor--100);
  border-top: 10px solid transparent;
  height: 0;
  margin: auto;
  position: absolute;
  top: calc(50% - 10px);
  width: 0;
`;

const TooltipArrowInner = styled.div`
  border-bottom: 10px solid transparent;
  border-right: 10px solid var(--pf-v6-global--BackgroundColor--100);
  border-top: 10px solid transparent;
  height: 0;
  left: 2px;
  margin: auto;
  position: absolute;
  top: calc(50% - 10px);
  width: 0;
`;

const TooltipActions = styled.div`
  background-color: var(--pf-v6-global--BackgroundColor--100);
  border-radius: 2px;
  border: 1px solid var(--pf-v6-global--BorderColor--100);
  padding: 5px;
`;

function WorkflowActionTooltip({ actions, pointX, pointY }) {
  const tipHeight = 25 * actions.length + 5 * actions.length - 1 + 10;
  return (
    <foreignObject
      x={pointX}
      y={Number(pointY) - tipHeight / 2}
      width="52"
      height={tipHeight}
    >
      <TooltipContents>
        <TooltipArrow>
          <TooltipArrowOuter />
          <TooltipArrowInner />
        </TooltipArrow>
        <TooltipActions>{actions}</TooltipActions>
      </TooltipContents>
    </foreignObject>
  );
}

export default WorkflowActionTooltip;
