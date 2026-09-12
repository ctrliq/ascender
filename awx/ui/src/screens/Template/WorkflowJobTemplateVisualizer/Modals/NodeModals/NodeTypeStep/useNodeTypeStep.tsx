import type {
  NodeTemplate,
  WorkflowNode,
} from 'components/Workflow/workflowReducer';
import type { SetFieldTouched } from 'components/LaunchPrompt/types';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import type { FieldInputProps } from 'formik';
import StepName from 'components/LaunchPrompt/steps/StepName';
import { stringIsUUID } from 'util/strings';
import NodeTypeStep from './NodeTypeStep';

const STEP_ID = 'nodeType';

export default function useNodeTypeStep(nodeToEdit: WorkflowNode | null) {
  const { t } = useLingui();
  const [, meta] = useField<string>('nodeType');
  const [approvalNameField] = useField<string>('approvalName');
  const [nodeTypeField, ,] = useField<string>('nodeType');
  const [, identifierMeta] = useField<string>('identifier');
  const [nodeResourceField, nodeResourceMeta] = useField<NodeTemplate | null>({
    name: 'nodeResource',
    validate: (value) => {
      if (
        value?.type === 'job_template' &&
        (!value?.project ||
          value?.project === null ||
          ((!value?.inventory || value?.inventory === null) &&
            !value?.ask_inventory_on_launch))
      ) {
        return t`Job Templates with a missing inventory or project cannot be selected when creating or editing nodes.  Select another template or fix the missing fields to proceed.`;
      }
      return undefined;
    },
  });

  const formError =
    !!meta.error || !!nodeResourceMeta.error || !!identifierMeta.error;

  return {
    step: getStep(
      t`Node type`,
      nodeTypeField,
      approvalNameField,
      nodeResourceField,
      formError,
      nodeToEdit
    ),
    initialValues: getInitialValues(),
    isReady: true,
    contentError: null,
    hasError: formError,
    setTouched: (setFieldTouched: SetFieldTouched) => {
      setFieldTouched('nodeType', true, false);
    },
    validate: () => {},
  };
}
function getStep(
  label: React.ReactNode,
  nodeTypeField: FieldInputProps<string>,
  approvalNameField: FieldInputProps<string>,
  nodeResourceField: FieldInputProps<NodeTemplate | null>,
  formError: boolean,
  nodeToEdit: WorkflowNode | null
) {
  const isEnabled = () => {
    if (
      (nodeTypeField.value !== 'workflow_approval_template' &&
        nodeResourceField.value === null) ||
      (nodeTypeField.value === 'workflow_approval_template' &&
        approvalNameField.value === '') ||
      formError
    ) {
      return false;
    }
    return true;
  };
  return {
    id: STEP_ID,
    name: (
      <StepName hasErrors={formError} id="node-type-step">
        {label}
      </StepName>
    ),
    component: (
      <NodeTypeStep
        isIdentifierRequired={Boolean(
          nodeToEdit?.originalNodeObject &&
          !stringIsUUID(nodeToEdit.originalNodeObject.identifier)
        )}
      />
    ),
    enableNext: isEnabled(),
  };
}

function getInitialValues() {
  return {
    approvalName: '',
    approvalDescription: '',
    timeoutMinutes: 0,
    timeoutSeconds: 0,
    contextTemplate: '',
    requiredApprovals: 1,
    onTimeout: 'deny',
    nodeType: 'job_template',
    convergence: 'any',
    identifier: '',
  };
}
