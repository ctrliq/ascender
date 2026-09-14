import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  ExclamationTriangleIcon,
  PauseIcon,
  TimesIcon,
} from '@patternfly/react-icons';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import type { WorkflowAction } from './workflowReducer';
import './WorkflowLegend.css';

function WorkflowLegend() {
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;
  const { t } = useLingui();
  return (
    <div className="ascender-workflow-legend__wrapper">
      <div className="ascender-workflow-legend__header">
        <b>{t`Legend`}</b>
        <TimesIcon
          className="ascender-workflow-legend__close"
          onClick={() => dispatch({ type: 'TOGGLE_LEGEND' })}
        />
      </div>
      <ul className="ascender-workflow-legend__legend">
        <li>
          <div className="ascender-workflow-legend__node-type-letter">JT</div>
          <span>{t`Job Template`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__node-type-letter">W</div>
          <span>{t`Workflow`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__node-type-letter">I</div>
          <span>{t`Inventory Sync`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__node-type-letter">P</div>
          <span>{t`Project Sync`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__node-type-letter">M</div>
          <span>{t`Management Job`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__node-type-letter">
            <PauseIcon />
          </div>
          <span>{t`Approval`}</span>
        </li>
        <li>
          <ExclamationTriangleIcon className="ascender-workflow-legend__styled-exclamation-triangle-icon" />
          <span>{t`Warning`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__link ascender-workflow-legend__success-link" />
          <span>{t`On Success`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__link ascender-workflow-legend__failure-link" />
          <span>{t`On Failure`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__link ascender-workflow-legend__always-link" />
          <span>{t`Always`}</span>
        </li>
        <li>
          <div className="ascender-workflow-legend__link ascender-workflow-legend__condition-link" />
          <span>{t`On Condition`}</span>
        </li>
      </ul>
    </div>
  );
}

export default WorkflowLegend;
