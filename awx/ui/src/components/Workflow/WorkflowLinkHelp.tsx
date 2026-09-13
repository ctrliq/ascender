import React from 'react';

import { useLingui } from '@lingui/react/macro';
import type { WorkflowLink } from './workflowReducer';
import './WorkflowLinkHelp.css';

export interface WorkflowLinkHelpProps {
  link: WorkflowLink;
  [key: string]: unknown;
}

function WorkflowLinkHelp({ link }: WorkflowLinkHelpProps) {
  const { t } = useLingui();
  let linkType;
  switch (link.linkType) {
    case 'always':
      linkType = t`Always`;
      break;
    case 'success':
      linkType = t`On Success`;
      break;
    case 'failure':
      linkType = t`On Failure`;
      break;
    case 'condition':
      linkType = t`On Condition`;
      break;
    default:
      linkType = '';
  }

  let triggerLabel;
  switch (link.linkCondition?.trigger) {
    case 'failure':
      triggerLabel = t`On Failure`;
      break;
    case 'always':
      triggerLabel = t`Always`;
      break;
    default:
      triggerLabel = t`On Success`;
  }

  return (
    <dl className="awx-workflow-link-help__grid-dl">
      <dt>
        <b>{t`Run`}</b>
      </dt>
      <dd id="workflow-link-help-type">{linkType}</dd>
      {link.linkType === 'condition' && link.linkCondition && (
        <>
          <dt>
            <b>{t`Evaluate on`}</b>
          </dt>
          <dd id="workflow-link-help-trigger">{triggerLabel}</dd>
          <dt>
            <b>{t`Condition`}</b>
          </dt>
          <dd id="workflow-link-help-condition">
            {`${link.linkCondition.artifact_key} ${
              link.linkCondition.operator === 'ne' ? '!=' : '=='
            } ${link.linkCondition.expected_value}`}
          </dd>
        </>
      )}
    </dl>
  );
}

export default WorkflowLinkHelp;
