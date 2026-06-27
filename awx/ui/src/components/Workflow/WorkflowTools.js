import React, { useContext } from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { Button, Tooltip } from '@patternfly/react-core';
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  DesktopIcon,
  HomeIcon,
  MinusIcon,
  PlusIcon,
  TimesIcon,
} from '@patternfly/react-icons';
import { WorkflowDispatchContext } from 'contexts/Workflow';

const Wrapper = styled.div`
  background-color: var(--ascender-workflow-node-bg);
  border: 1px solid var(--pf-v6-global--BorderColor--100);
  height: 215px;
  position: relative;
`;

const Header = styled.div`
  border-bottom: 1px solid var(--pf-v6-global--BorderColor--100);
  padding: 10px;
`;

const Pan = styled.div`
  align-items: center;
  display: flex;
`;

const PanCenter = styled.div`
  display: flex;
  flex-direction: column;
`;

const Tools = styled.div`
  align-items: center;
  display: flex;
  padding: 20px;
`;

const Close = styled(TimesIcon)`
  cursor: pointer;
  position: absolute;
  right: 10px;
  top: 15px;
`;

function WorkflowTools({
  onFitGraph,
  onPan,
  onPanToMiddle,
  onZoomChange,
  zoomPercentage,
}) {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const zoomIn = () => {
    const newScale =
      Math.ceil((zoomPercentage + 10) / 10) * 10 < 200
        ? Math.ceil((zoomPercentage + 10) / 10) * 10
        : 200;
    onZoomChange(newScale / 100);
  };

  const zoomOut = () => {
    const newScale =
      Math.floor((zoomPercentage - 10) / 10) * 10 > 10
        ? Math.floor((zoomPercentage - 10) / 10) * 10
        : 10;
    onZoomChange(newScale / 100);
  };

  return (
    <Wrapper>
      <Header>
        <b>{t`Tools`}</b>
        <Close onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })} />
      </Header>
      <Tools>
        <Tooltip
          content={t`Fit the graph to the available screen size`}
          position="bottom"
        >
          <Button icon={<DesktopIcon />}
            ouiaId="visualizer-zoom-to-fit-button"
            variant="tertiary"
            css="margin-right: 30px;"
            onClick={() => onFitGraph()}
           />
        </Tooltip>
        <Tooltip content={t`Zoom Out`} position="bottom">
          <Button icon={<MinusIcon />}
            ouiaId="visualizer-zoom-out-button"
            variant="tertiary"
            css="margin-right: 10px;"
            onClick={() => zoomOut()}
           />
        </Tooltip>
        <input
          id="zoom-slider"
          max="200"
          min="10"
          onChange={(event) =>
            onZoomChange(parseInt(event.target.value, 10) / 100)
          }
          step="10"
          type="range"
          value={zoomPercentage}
        />
        <Tooltip content={t`Zoom In`} position="bottom">
          <Button icon={<PlusIcon />}
            ouiaId="visualizer-zoom-in-button"
            variant="tertiary"
            css="margin: 0px 25px 0px 10px;"
            onClick={() => zoomIn()}
           />
        </Tooltip>
        <Pan>
          <Tooltip content={t`Pan Left`} position="left">
            <Button icon={<CaretLeftIcon />}
              ouiaId="visualizer-pan-left-button"
              variant="tertiary"
              css="margin-right: 10px;"
              onClick={() => onPan('left')}
             />
          </Tooltip>
          <PanCenter>
            <Tooltip content={t`Pan Up`} position="top">
              <Button icon={<CaretUpIcon />}
                ouiaId="visualizer-pan-up-button"
                variant="tertiary"
                css="margin-bottom: 10px;"
                onClick={() => onPan('up')}
               />
            </Tooltip>
            <Tooltip
              content={t`Set zoom to 100% and center graph`}
              position="top"
            >
              <Button icon={<HomeIcon />}
                ouiaId="visualizer-pan-middle-button"
                variant="tertiary"
                onClick={() => onPanToMiddle()}
               />
            </Tooltip>
            <Tooltip content={t`Pan Down`} position="bottom">
              <Button icon={<CaretDownIcon />}
                ouiaId="visualizer-pan-down-button"
                variant="tertiary"
                css="margin-top: 10px;"
                onClick={() => onPan('down')}
               />
            </Tooltip>
          </PanCenter>
          <Tooltip content={t`Pan Right`} position="right">
            <Button icon={<CaretRightIcon />}
              ouiaId="visualizer-pan-right-button"
              variant="tertiary"
              css="margin-left: 10px;"
              onClick={() => onPan('right')}
             />
          </Tooltip>
        </Pan>
      </Tools>
    </Wrapper>
  );
}

export default WorkflowTools;
