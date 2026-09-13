import React from 'react';
import { PauseIcon } from '@patternfly/react-icons';
import type { WorkflowNode } from './workflowReducer';
import './WorkflowNodeTypeLetter.css';

export interface WorkflowNodeTypeLetterProps {
  node: WorkflowNode;
}

function WorkflowNodeTypeLetter({ node }: WorkflowNodeTypeLetterProps) {
  const unifiedJobTemplate =
    node?.fullUnifiedJobTemplate ||
    node?.originalNodeObject?.summary_fields?.unified_job_template;

  if (!unifiedJobTemplate) {
    return null;
  }

  let nodeTypeLetter;
  if (
    unifiedJobTemplate.type ||
    unifiedJobTemplate.unified_job_type ||
    node?.job?.type
  ) {
    const ujtType =
      unifiedJobTemplate.type ||
      unifiedJobTemplate.unified_job_type ||
      node.job?.type;
    switch (ujtType) {
      case 'job_template':
      case 'job':
        nodeTypeLetter = 'JT';
        break;
      case 'project':
      case 'project_update':
        nodeTypeLetter = 'P';
        break;
      case 'inventory_source':
      case 'inventory_update':
        nodeTypeLetter = 'I';
        break;
      case 'system_job_template':
      case 'system_job':
        nodeTypeLetter = 'M';
        break;
      case 'workflow_job_template':
      case 'workflow_job':
        nodeTypeLetter = 'W';
        break;
      case 'workflow_approval_template':
      case 'workflow_approval':
        nodeTypeLetter = (
          <PauseIcon className="awx-workflow-node-type-letter__centered-pause-icon" />
        );
        break;
      default:
        nodeTypeLetter = '';
    }
  }

  return (
    <foreignObject y="50" x="-10" height="20" width="20">
      <div
        className="awx-workflow-node-type-letter__letter"
        id={`node-${node.id}-type-letter`}
      >
        {nodeTypeLetter}
      </div>
    </foreignObject>
  );
}

export default WorkflowNodeTypeLetter;
