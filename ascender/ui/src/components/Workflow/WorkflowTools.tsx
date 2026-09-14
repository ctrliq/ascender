import React, { useContext } from 'react';
import { useLingui } from '@lingui/react/macro';
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
import type { WorkflowAction } from './workflowReducer';
import './WorkflowTools.css';

export interface WorkflowToolsProps {
  onFitGraph: () => void;
  /** Which way the graph moves: up, down, left, right, or a zoom in or out. */
  onPan: (direction: string) => void;
  onPanToMiddle: () => void;
  onZoomChange: (zoom: number) => void;
  zoomPercentage: number;
  [key: string]: unknown;
}

function WorkflowTools({
  onFitGraph,
  onPan,
  onPanToMiddle,
  onZoomChange,
  zoomPercentage,
}: WorkflowToolsProps) {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
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
    <div className="awx-workflow-tools__wrapper">
      <div className="awx-workflow-tools__header">
        <b>{t`Tools`}</b>
        <TimesIcon
          className="awx-workflow-tools__close"
          onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
        />
      </div>
      <div className="awx-workflow-tools__tools">
        <Tooltip
          content={t`Fit the graph to the available screen size`}
          position="bottom"
        >
          <Button
            icon={<DesktopIcon />}
            className="awx-workflow-tools__margin-right-30"
            ouiaId="visualizer-zoom-to-fit-button"
            variant="tertiary"
            onClick={() => onFitGraph()}
          />
        </Tooltip>
        <Tooltip content={t`Zoom Out`} position="bottom">
          <Button
            icon={<MinusIcon />}
            className="awx-workflow-tools__margin-right-10"
            ouiaId="visualizer-zoom-out-button"
            variant="tertiary"
            onClick={() => zoomOut()}
          />
        </Tooltip>
        <input
          id="zoom-slider"
          max="200"
          min="10"
          onChange={(event) =>
            onZoomChange(
              parseInt((event.target as HTMLInputElement).value, 10) / 100
            )
          }
          step="10"
          type="range"
          value={zoomPercentage}
        />
        <Tooltip content={t`Zoom In`} position="bottom">
          <Button
            icon={<PlusIcon />}
            className="awx-workflow-tools__margin-0-25-0-10"
            ouiaId="visualizer-zoom-in-button"
            variant="tertiary"
            onClick={() => zoomIn()}
          />
        </Tooltip>
        <div className="awx-workflow-tools__pan">
          <Tooltip content={t`Pan Left`} position="left">
            <Button
              icon={<CaretLeftIcon />}
              className="awx-workflow-tools__margin-right-10"
              ouiaId="visualizer-pan-left-button"
              variant="tertiary"
              onClick={() => onPan('left')}
            />
          </Tooltip>
          <div className="awx-workflow-tools__pan-center">
            <Tooltip content={t`Pan Up`} position="top">
              <Button
                icon={<CaretUpIcon />}
                className="awx-workflow-tools__margin-bottom-10"
                ouiaId="visualizer-pan-up-button"
                variant="tertiary"
                onClick={() => onPan('up')}
              />
            </Tooltip>
            <Tooltip
              content={t`Set zoom to 100% and center graph`}
              position="top"
            >
              <Button
                icon={<HomeIcon />}
                ouiaId="visualizer-pan-middle-button"
                variant="tertiary"
                onClick={() => onPanToMiddle()}
              />
            </Tooltip>
            <Tooltip content={t`Pan Down`} position="bottom">
              <Button
                icon={<CaretDownIcon />}
                className="awx-workflow-tools__margin-top-10"
                ouiaId="visualizer-pan-down-button"
                variant="tertiary"
                onClick={() => onPan('down')}
              />
            </Tooltip>
          </div>
          <Tooltip content={t`Pan Right`} position="right">
            <Button
              icon={<CaretRightIcon />}
              className="awx-workflow-tools__margin-left-10"
              ouiaId="visualizer-pan-right-button"
              variant="tertiary"
              onClick={() => onPan('right')}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default WorkflowTools;
