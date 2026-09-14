import type {
  WorkflowAction,
  WorkflowState,
  WorkflowNode,
} from 'components/Workflow/workflowReducer';
import type { WorkflowJobTemplate } from 'types/api';
import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Badge as PFBadge,
  Button,
  Title,
  Tooltip,
} from '@patternfly/react-core';
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

  return (
    <div id="visualizer-toolbar">
      <div className="awx-visualizer-toolbar__display-align-items">
        <Title
          className="awx-visualizer-toolbar__white-space-margin"
          headingLevel="h2"
          size="xl"
          id="visualizer-toolbar-template-name"
        >
          {template.name}
        </Title>
        <div className="awx-visualizer-toolbar__align-items-display">
          <div>{t`Total Nodes`}</div>
          <PFBadge
            className="awx-visualizer-toolbar__badge"
            id="visualizer-total-nodes-badge"
            isRead
          >
            {totalNodes}
          </PFBadge>
          <Tooltip content={t`Toggle legend`} position="bottom">
            <Button
              aria-label={t`Toggle legend`}
              id="visualizer-toggle-legend"
              className={`awx-visualizer-toolbar__action-button ${
                totalNodes > 0 && showLegend ? 'pf-m-active' : undefined
              }`}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
              variant="plain"
            >
              <CompassIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t`Toggle tools`} position="bottom">
            <Button
              aria-label={t`Toggle tools`}
              id="visualizer-toggle-tools"
              className={`awx-visualizer-toolbar__action-button ${
                totalNodes > 0 && showTools ? 'pf-m-active' : undefined
              }`}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
              variant="plain"
            >
              <WrenchIcon />
            </Button>
          </Tooltip>
          <Tooltip content={t`Workflow documentation`} position="bottom">
            <Button
              className="awx-visualizer-toolbar__action-button"
              aria-label={t`Workflow documentation`}
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
            <Tooltip content={t`Launch workflow`} position="bottom">
              <LaunchButton resource={template} aria-label={t`Launch workflow`}>
                {({ handleLaunch, isLaunching }) => (
                  <Button
                    className="awx-visualizer-toolbar__action-button"
                    id="visualizer-launch"
                    variant="plain"
                    isDisabled={
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
              <Tooltip content={t`Delete all nodes`} position="bottom">
                <Button
                  className="awx-visualizer-toolbar__action-button"
                  id="visualizer-delete-all"
                  aria-label={t`Delete all nodes`}
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
                className="awx-visualizer-toolbar__margin-0-32"
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
