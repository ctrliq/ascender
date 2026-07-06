import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';

import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { getAddedAndRemoved } from 'util/lists';
import NodeModal from './NodeModal';

function NodeAddModal() {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { addNodeSource } = useContext(WorkflowStateContext);

  const addNode = (values, config) => {
    const {
      approvalName,
      approvalDescription,
      timeoutMinutes,
      timeoutSeconds,
      linkType,
      linkConditionTrigger,
      linkConditionArtifactKey,
      linkConditionOperator,
      linkConditionExpectedValue,
      convergence,
      identifier,
    } = values;

    if (values) {
      const { added, removed } = getAddedAndRemoved(
        config?.defaults?.credentials,
        values?.credentials
      );

      values.addedCredentials = added;
      values.removedCredentials = removed;
    }

    const node = {
      linkType,
      all_parents_must_converge: convergence === 'all',
      identifier,
    };

    if (linkType === 'condition') {
      node.linkCondition = {
        trigger: linkConditionTrigger || 'success',
        artifact_key: linkConditionArtifactKey,
        operator: linkConditionOperator || 'eq',
        expected_value: linkConditionExpectedValue || '',
      };
    }

    delete values.convergence;

    delete values.linkType;
    delete values.linkConditionTrigger;
    delete values.linkConditionArtifactKey;
    delete values.linkConditionOperator;
    delete values.linkConditionExpectedValue;

    if (values.nodeType === 'workflow_approval_template') {
      node.nodeResource = {
        description: approvalDescription,
        name: approvalName,
        timeout: Number(timeoutMinutes) * 60 + Number(timeoutSeconds),
        type: 'workflow_approval_template',
      };
    } else {
      node.nodeResource = values.nodeResource;
      if (
        values?.nodeType === 'job_template' ||
        values?.nodeType === 'workflow_job_template'
      ) {
        node.promptValues = values;
      }
      if (values?.nodeType === 'system_job_template') {
        node.promptValues = {
          extra_data: values?.extra_data,
        };
      }
    }

    // these live on the node itself, not in the prompt values (which alias
    // `values`); leaking identifier into the node POST body 400s when blank
    delete values.identifier;
    delete values.nodeType;
    delete values.nodeResource;

    dispatch({
      type: 'CREATE_NODE',
      node,
    });
  };

  return (
    <NodeModal
      askLinkType={addNodeSource !== 1}
      onSave={addNode}
      title={t`Add Node`}
    />
  );
}

export default NodeAddModal;
