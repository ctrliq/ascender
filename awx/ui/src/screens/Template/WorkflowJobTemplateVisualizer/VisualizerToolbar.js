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
import styled from 'styled-components';
import { LaunchButton } from 'components/LaunchButton';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';

const Badge = styled(PFBadge)`
  align-items: center;
  display: flex;
  justify-content: center;
  margin-left: 10px;
`;

const ActionButton = styled(Button)`
  padding: 6px 10px;
  margin: 0px 6px;
  border: none;
  &:hover {
    background-color: var(--pf-v6-global--primary-color--100);
    color: #fff;
  }

  &.pf-m-active {
    background-color: var(--pf-v6-global--primary-color--100);
    color: #fff;
  }
`;
ActionButton.displayName = 'ActionButton';

function VisualizerToolbar({
  onClose,
  onSave,
  template,
  hasUnsavedChanges,
  readOnly,
}) {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { nodes, showLegend, showTools } = useContext(WorkflowStateContext);
  const config = useConfig();

  const totalNodes = nodes.reduce((n, node) => n + !node.isDeleted, 0) - 1;

  return (
    <div id="visualizer-toolbar">
      <div css="display: flex; align-items: center; border-bottom: 1px solid var(--pf-t--global--border--color--default); padding: 8px 16px;">
        <Title
          headingLevel="h2"
          size="xl"
          id="visualizer-toolbar-template-name"
          css="white-space: nowrap; margin: 0;"
        >
          {template.name}
        </Title>
        <div css="align-items: center; display: flex; flex: 1; justify-content: flex-end">
          <div>{t`Total Nodes`}</div>
          <Badge id="visualizer-total-nodes-badge" isRead>
            {totalNodes}
          </Badge>
          <Tooltip content={t`Toggle legend`} position="bottom">
            <ActionButton
              aria-label={t`Toggle legend`}
              id="visualizer-toggle-legend"
              className={totalNodes > 0 && showLegend ? 'pf-m-active' : undefined}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
              variant="plain"
            >
              <CompassIcon />
            </ActionButton>
          </Tooltip>
          <Tooltip content={t`Toggle tools`} position="bottom">
            <ActionButton
              aria-label={t`Toggle tools`}
              id="visualizer-toggle-tools"
              className={totalNodes > 0 && showTools ? 'pf-m-active' : undefined}
              isDisabled={totalNodes === 0}
              onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
              variant="plain"
            >
              <WrenchIcon />
            </ActionButton>
          </Tooltip>
          <Tooltip
            content={t`Workflow documentation`}
            position="bottom"
          >
            <ActionButton
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
            </ActionButton>
          </Tooltip>
          {template.summary_fields?.user_capabilities?.start && (
            <Tooltip content={t`Launch workflow`} position="bottom">
              <LaunchButton
                resource={template}
                aria-label={t`Launch workflow`}
              >
                {({ handleLaunch, isLaunching }) => (
                  <ActionButton
                    id="visualizer-launch"
                    variant="plain"
                    isDisabled={
                      hasUnsavedChanges || totalNodes === 0 || isLaunching
                    }
                    onClick={handleLaunch}
                  >
                    <RocketIcon />
                  </ActionButton>
                )}
              </LaunchButton>
            </Tooltip>
          )}
          {!readOnly && (
            <>
              <Tooltip
                content={t`Delete all nodes`}
                position="bottom"
              >
                <ActionButton
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
                </ActionButton>
              </Tooltip>
              <Button
                ouiaId="visualizer-save-button"
                id="visualizer-save"
                css="margin: 0 32px"
                aria-label={t`Save`}
                variant="primary"
                onClick={onSave}
              >
                {t`Save`}
              </Button>
            </>
          )}
          <Button icon={<TimesIcon />}
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
