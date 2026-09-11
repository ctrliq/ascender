import type { WorkflowAction } from 'components/Workflow/workflowReducer';
import type { Untyped } from 'types/api';
import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';

import { WorkflowDispatchContext } from 'contexts/Workflow';
import NodeModal from './NodeModal';

function NodeEditModal() {
  const { t } = useLingui();
  const dispatch = useContext(
    WorkflowDispatchContext
  ) as React.Dispatch<WorkflowAction>;

  const updateNode = (values: Untyped, config: Untyped) => {
    const {
      approvalName,
      approvalDescription,
      credentials,
      linkType,
      linkConditionTrigger,
      linkConditionArtifactKey,
      linkConditionOperator,
      linkConditionExpectedValue,
      nodeResource,
      nodeType,
      timeoutMinutes,
      timeoutSeconds,
      convergence,
      maxRetries,
      identifier,
      ...rest
    } = values;
    // Built up from the fields the chosen node type carries.
    let node: Record<string, Untyped>;
    if (values.nodeType === 'workflow_approval_template') {
      node = {
        all_parents_must_converge: convergence === 'all',
        max_retries: 0,
        nodeResource: {
          description: approvalDescription,
          name: approvalName,
          timeout: Number(timeoutMinutes) * 60 + Number(timeoutSeconds),
          context_template: values.contextTemplate || '',
          required_approvals: Number(values.requiredApprovals) || 1,
          on_timeout: values.onTimeout || 'deny',
          type: 'workflow_approval_template',
        },
        identifier,
      };
    } else {
      node = {
        nodeResource,
        all_parents_must_converge: convergence === 'all',
        max_retries: Number(maxRetries) || 0,
        identifier,
      };
      if (nodeType === 'job_template' || nodeType === 'workflow_job_template') {
        node.promptValues = {
          ...rest,
          credentials,
        };

        node.launchConfig = config;
      }
      if (nodeType === 'system_job_template') {
        node.promptValues = {
          extra_data: values?.extra_data,
        };
      }
    }

    dispatch({
      type: 'UPDATE_NODE',
      node,
    });
  };

  return (
    <NodeModal askLinkType={false} onSave={updateNode} title={t`Edit Node`} />
  );
}

export default NodeEditModal;
