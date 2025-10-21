import 'styled-components/macro';
import React, { useContext } from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { func, number } from 'prop-types';
import { Button, Tooltip } from '@patternfly/react-core';
import {
  LucideIconChevronDown,
  LucideIconChevronLeft,
  LucideIconChevronRight,
  LucideIconChevronUp,
  LucideIconMonitor,
  LucideIconHouse,
  LucideIconMinus,
  LucideIconPlus,
  LucideIconX,
} from '@ctrliq/quantic-react';
import { WorkflowDispatchContext } from 'contexts/Workflow';

const Wrapper = styled.div`
  background-color: white;
  border: 1px solid #c7c7c7;
  height: 215px;
  position: relative;
`;

const Header = styled.div`
  border-bottom: 1px solid #c7c7c7;
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

const Close = styled(LucideIconX)`
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
        <Close
          onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
          data-original-icon="TimesIcon"
        />
      </Header>
      <Tools>
        <Tooltip
          content={t`Fit the graph to the available screen size`}
          position="bottom"
        >
          <Button
            ouiaId="visualizer-zoom-to-fit-button"
            variant="tertiary"
            css="margin-right: 30px;"
            onClick={() => onFitGraph()}
          >
            <LucideIconMonitor data-original-icon="DesktopIcon" size={16} />
          </Button>
        </Tooltip>
        <Tooltip content={t`Zoom Out`} position="bottom">
          <Button
            ouiaId="visualizer-zoom-out-button"
            variant="tertiary"
            css="margin-right: 10px;"
            onClick={() => zoomOut()}
          >
            <LucideIconMinus data-original-icon="MinusIcon" size={16} />
          </Button>
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
          <Button
            ouiaId="visualizer-zoom-in-button"
            variant="tertiary"
            css="margin: 0px 25px 0px 10px;"
            onClick={() => zoomIn()}
          >
            <LucideIconPlus data-original-icon="PlusIcon" size={16} />
          </Button>
        </Tooltip>
        <Pan>
          <Tooltip content={t`Pan Left`} position="left">
            <Button
              ouiaId="visualizer-pan-left-button"
              variant="tertiary"
              css="margin-right: 10px;"
              onClick={() => onPan('left')}
            >
              <LucideIconChevronLeft
                data-original-icon="CaretLeftIcon"
                size={16}
              />
            </Button>
          </Tooltip>
          <PanCenter>
            <Tooltip content={t`Pan Up`} position="top">
              <Button
                ouiaId="visualizer-pan-up-button"
                variant="tertiary"
                css="margin-bottom: 10px;"
                onClick={() => onPan('up')}
              >
                <LucideIconChevronUp
                  data-original-icon="CaretUpIcon"
                  size={16}
                />
              </Button>
            </Tooltip>
            <Tooltip
              content={t`Set zoom to 100% and center graph`}
              position="top"
            >
              <Button
                ouiaId="visualizer-pan-middle-button"
                variant="tertiary"
                onClick={() => onPanToMiddle()}
              >
                <LucideIconHouse data-original-icon="HomeIcon" size={16} />
              </Button>
            </Tooltip>
            <Tooltip content={t`Pan Down`} position="bottom">
              <Button
                ouiaId="visualizer-pan-down-button"
                variant="tertiary"
                css="margin-top: 10px;"
                onClick={() => onPan('down')}
              >
                <LucideIconChevronDown
                  data-original-icon="CaretDownIcon"
                  size={16}
                />
              </Button>
            </Tooltip>
          </PanCenter>
          <Tooltip content={t`Pan Right`} position="right">
            <Button
              ouiaId="visualizer-pan-right-button"
              variant="tertiary"
              css="margin-left: 10px;"
              onClick={() => onPan('right')}
            >
              <LucideIconChevronRight
                data-original-icon="CaretRightIcon"
                size={16}
              />
            </Button>
          </Tooltip>
        </Pan>
      </Tools>
    </Wrapper>
  );
}

WorkflowTools.propTypes = {
  onFitGraph: func.isRequired,
  onPan: func.isRequired,
  onPanToMiddle: func.isRequired,
  onZoomChange: func.isRequired,
  zoomPercentage: number.isRequired,
};

export default WorkflowTools;
