import type {
  WorkflowAction,
  WorkflowState,
  WorkflowNode,
} from 'components/Workflow/workflowReducer';
import type { WorkflowJobTemplate } from 'types/api';
import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Badge as PFBadge, Button, Title } from '@patternfly/react-core';
import {
  BookIcon,
  CompassIcon,
  RocketIcon,
  TimesIcon,
  TrashAltIcon,
  WrenchIcon,
} from '@patternfly/react-icons';
import { LaunchButton } from 'components/LaunchButton';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import './VisualizerToolbar.css';
import Tooltip from 'components/Tooltip';

export interface VisualizerToolbarProps {
  onClose: () => void;
  onSave: () => void;
  template: WorkflowJobTemplate;
  hasUnsavedChanges: boolean;
  readOnly: boolean;
}

function VisualizerToolbar({
  onClose,
  onSave,
  template,
  hasUnsavedChanges,
  readOnly,
}: VisualizerToolbarProps) {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const { nodes, showLegend, showTools } = useContext(
    WorkflowStateContext
  ) as WorkflowState;
  const config = useConfig();

  const totalNodes =
    nodes.reduce(
      (n: number, node: WorkflowNode) => n + (node.isDeleted ? 0 : 1),
      0
    ) - 1;

  // A launch runs what is saved, so the tooltip says what stands in the way.
  let launchTooltip = t`Launch Workflow`;
  if (hasUnsavedChanges) {
    launchTooltip = t`Save the Workflow to Launch It`;
  } else if (totalNodes === 0) {
    launchTooltip = t`Add a Node to Launch the Workflow`;
  }

  return (
    <div id="visualizer-toolbar">
      <div className="ascender-visualizer-toolbar__display-align-items">
        <Title
          className="ascender-visualizer-toolbar__white-space-margin"
          headingLevel="h2"
          size="xl"
          id="visualizer-toolbar-template-name"
        >
          {template.name}
        </Title>
        <div className="ascender-visualizer-toolbar__align-items-display">
          <div>{t`Total Nodes`}</div>
          <PFBadge
            className="ascender-visualizer-toolbar__badge"
            id="visualizer-total-nodes-badge"
            isRead
          >
            {totalNodes}
          </PFBadge>
          <Tooltip content={t`Toggle Legend`} position="bottom">
            <Button
              aria-label={t`Toggle Legend`}
              id="visualizer-toggle-legend"
              className={`ascender-visualizer-toolbar__action-button ${
                totalNodes > 0 && showLegend ? 'pf-m-active' : undefined
              }`}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
              variant="plain"
            >
              <CompassIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t`Toggle Tools`} position="bottom">
            <Button
              aria-label={t`Toggle Tools`}
              id="visualizer-toggle-tools"
              className={`ascender-visualizer-toolbar__action-button ${
                totalNodes > 0 && showTools ? 'pf-m-active' : undefined
              }`}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
              variant="plain"
            >
              <WrenchIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t`Workflow Documentation`} position="bottom">
            <Button
              className="ascender-visualizer-toolbar__action-button"
              aria-label={t`Workflow Documentation`}
              id="visualizer-documentation"
              variant="plain"
              component="a"
              target="_blank"
              rel="noopener noreferrer"
              href={`${getDocsBaseUrl(
                config
              )}/userguide/workflow_templates.html#ug-wf-editor`}
            >
              <BookIcon />
            </Button>
          </Tooltip>
          {template.summary_fields?.user_capabilities?.start && (
            <Tooltip content={launchTooltip} position="bottom">
              <LaunchButton resource={template} aria-label={t`Launch Workflow`}>
                {({ handleLaunch, isLaunching }) => (
                  /*
                   * Aria-disabled rather than disabled, so the pointer still
                   * reaches the button and the tooltip can say why it cannot
                   * be pressed.
                   */
                  <Button
                    className="ascender-visualizer-toolbar__action-button"
                    id="visualizer-launch"
                    aria-label={t`Launch Workflow`}
                    variant="plain"
                    isAriaDisabled={
                      hasUnsavedChanges || totalNodes === 0 || isLaunching
                    }
                    onClick={handleLaunch}
                  >
                    <RocketIcon />
                  </Button>
                )}
              </LaunchButton>
            </Tooltip>
          )}
          {!readOnly && (
            <>
              <Tooltip content={t`Delete All Nodes`} position="bottom">
                <Button
                  className="ascender-visualizer-toolbar__action-button"
                  id="visualizer-delete-all"
                  aria-label={t`Delete All Nodes`}
                  isDisabled={totalNodes === 0}
                  onClick={() =>
                    dispatch({
                      type: 'SET_SHOW_DELETE_ALL_NODES_MODAL',
                      value: true,
                    })
                  }
                  variant="plain"
                >
                  <TrashAltIcon />
                </Button>
              </Tooltip>
              <Button
                className="ascender-visualizer-toolbar__margin-0-32"
                ouiaId="visualizer-save-button"
                id="visualizer-save"
                aria-label={t`Save`}
                variant="primary"
                onClick={onSave}
              >
                {t`Save`}
              </Button>
            </>
          )}
          <Button
            icon={<TimesIcon />}
            ouiaId="visualizer-close-button"
            id="visualizer-close"
            aria-label={t`Close`}
            onClick={onClose}
            variant="plain"
          />
        </div>
      </div>
    </div>
  );
}

export default VisualizerToolbar;
