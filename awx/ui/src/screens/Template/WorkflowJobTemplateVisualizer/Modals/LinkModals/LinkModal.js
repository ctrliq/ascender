import React, { useContext, useState } from 'react';
import {
	Button,
	FormGroup,
	TextInput
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';

import { useLingui } from '@lingui/react/macro';

import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';

function LinkModal({ header, onConfirm }) {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  const { linkToEdit } = useContext(WorkflowStateContext);
  const [linkType, setLinkType] = useState(
    linkToEdit ? linkToEdit.linkType : 'success'
  );
  const [trigger, setTrigger] = useState(
    linkToEdit?.linkCondition?.trigger || 'success'
  );
  const [artifactKey, setArtifactKey] = useState(
    linkToEdit?.linkCondition?.artifact_key || ''
  );
  const [operator, setOperator] = useState(
    linkToEdit?.linkCondition?.operator || 'eq'
  );
  const [expectedValue, setExpectedValue] = useState(
    linkToEdit?.linkCondition?.expected_value || ''
  );

  const isConditionInvalid = linkType === 'condition' && artifactKey === '';

  return (
    <Modal
      width={600}
      header={header}
      isOpen
      title={t`Workflow Link`}
      aria-label={t`Workflow link modal`}
      onClose={() => dispatch({ type: 'CANCEL_LINK_MODAL' })}
      actions={[
        <Button
          ouiaId="link-confirm-button"
          id="link-confirm"
          key="save"
          variant="primary"
          aria-label={t`Save link changes`}
          isDisabled={isConditionInvalid}
          onClick={() =>
            onConfirm(
              linkType,
              linkType === 'condition'
                ? {
                    trigger,
                    artifact_key: artifactKey,
                    operator,
                    expected_value: expectedValue,
                  }
                : null
            )
          }
        >
          {t`Save`}
        </Button>,
        <Button
          ouiaId="link-cancel-button"
          id="link-cancel"
          key="cancel"
          variant="link"
          aria-label={t`Cancel link changes`}
          onClick={() => dispatch({ type: 'CANCEL_LINK_MODAL' })}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      <FormGroup fieldId="link-select" label={t`Run`}>
        <AnsibleSelect
          id="link-select"
          name="linkType"
          value={linkType}
          data={[
            {
              value: 'always',
              key: 'always',
              label: t`Always`,
            },
            {
              value: 'success',
              key: 'success',
              label: t`On Success`,
            },
            {
              value: 'failure',
              key: 'failure',
              label: t`On Failure`,
            },
            {
              value: 'condition',
              key: 'condition',
              label: t`On Condition`,
            },
          ]}
          onChange={(event, value) => {
            setLinkType(value);
          }}
        />
      </FormGroup>
      {linkType === 'condition' && (
        <>
          <FormGroup
            fieldId="link-condition-trigger"
            label={t`Evaluate on`}
            labelHelp={
              <Popover
                content={t`Parent node outcome required before the condition is evaluated.`}
              />
            }
          >
            <AnsibleSelect
              id="link-condition-trigger"
              name="trigger"
              value={trigger}
              data={[
                {
                  value: 'success',
                  key: 'success',
                  label: t`On Success`,
                },
                {
                  value: 'failure',
                  key: 'failure',
                  label: t`On Failure`,
                },
                {
                  value: 'always',
                  key: 'always',
                  label: t`Always`,
                },
              ]}
              onChange={(event, value) => setTrigger(value)}
            />
          </FormGroup>
          <FormGroup
            fieldId="link-condition-artifact-key"
            label={t`Artifact key`}
            isRequired
            labelHelp={
              <Popover
                content={t`Name of an artifact produced by the parent node via set_stats. The link is only followed when the parent job matches the chosen outcome and the condition is true. A missing key never matches.`}
              />
            }
          >
            <TextInput
              id="link-condition-artifact-key"
              type="text"
              value={artifactKey}
              isRequired
              validated={artifactKey === '' ? 'error' : 'default'}
              onChange={(event, value) => setArtifactKey(value)}
              aria-label={t`Artifact key`}
            />
          </FormGroup>
          <FormGroup fieldId="link-condition-operator" label={t`Operator`}>
            <AnsibleSelect
              id="link-condition-operator"
              name="operator"
              value={operator}
              data={[
                {
                  value: 'eq',
                  key: 'eq',
                  label: t`Equals`,
                },
                {
                  value: 'ne',
                  key: 'ne',
                  label: t`Not equals`,
                },
              ]}
              onChange={(event, value) => setOperator(value)}
            />
          </FormGroup>
          <FormGroup
            fieldId="link-condition-expected-value"
            label={t`Expected value`}
            labelHelp={
              <Popover
                content={t`Value to compare the artifact against. Interpreted as JSON when possible (e.g. true, 3), otherwise as a plain string.`}
              />
            }
          >
            <TextInput
              id="link-condition-expected-value"
              type="text"
              value={expectedValue}
              onChange={(event, value) => setExpectedValue(value)}
              aria-label={t`Expected value`}
            />
          </FormGroup>
        </>
      )}
    </Modal>
  );
}

export default LinkModal;
