import React from 'react';

import { useField } from 'formik';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { FormGroup, TextInput, Title } from '@patternfly/react-core';
import AnsibleSelect from 'components/AnsibleSelect';
import Popover from 'components/Popover';
import SelectableCard from 'components/SelectableCard';

const Grid = styled.div`
  display: grid;
  grid-auto-rows: minmax(100px, auto);
  grid-gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  margin: 20px 0px;
  width: 100%;
`;

const ConditionFields = styled.div`
  display: grid;
  grid-gap: 20px;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  margin-bottom: 20px;
  width: 100%;
`;

function RunStep() {
  const { t } = useLingui();
  const [field, , helpers] = useField('linkType');
  const [triggerField, , triggerHelpers] = useField('linkConditionTrigger');
  const [artifactKeyField, artifactKeyMeta, artifactKeyHelpers] = useField(
    'linkConditionArtifactKey'
  );
  const [operatorField, , operatorHelpers] = useField('linkConditionOperator');
  const [expectedValueField, , expectedValueHelpers] = useField(
    'linkConditionExpectedValue'
  );
  return (
    <>
      <Title headingLevel="h1" size="xl">
        {t`Run`}
      </Title>
      <p>
        {t`Specify the conditions under which this node should be executed`}
      </p>
      <Grid>
        <SelectableCard
          id="link-type-success"
          isSelected={field.value === 'success'}
          label={t`On Success`}
          description={t`Execute when the parent node results in a successful state.`}
          onClick={() => helpers.setValue('success')}
        />
        <SelectableCard
          id="link-type-failure"
          isSelected={field.value === 'failure'}
          label={t`On Failure`}
          description={t`Execute when the parent node results in a failure state.`}
          onClick={() => helpers.setValue('failure')}
        />
        <SelectableCard
          id="link-type-always"
          isSelected={field.value === 'always'}
          label={t`Always`}
          description={t`Execute regardless of the parent node's final state.`}
          onClick={() => helpers.setValue('always')}
        />
        <SelectableCard
          id="link-type-condition"
          isSelected={field.value === 'condition'}
          label={t`On Condition`}
          description={t`Execute when an artifact of the parent node matches the condition.`}
          onClick={() => helpers.setValue('condition')}
        />
      </Grid>
      {field.value === 'condition' && (
        <ConditionFields>
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
              name="linkConditionTrigger"
              value={triggerField.value}
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
              onChange={(event, value) => triggerHelpers.setValue(value)}
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
              value={artifactKeyField.value}
              isRequired
              validated={
                artifactKeyMeta.touched && artifactKeyField.value === ''
                  ? 'error'
                  : 'default'
              }
              onChange={(event, value) => artifactKeyHelpers.setValue(value)}
              aria-label={t`Artifact key`}
            />
          </FormGroup>
          <FormGroup fieldId="link-condition-operator" label={t`Operator`}>
            <AnsibleSelect
              id="link-condition-operator"
              name="linkConditionOperator"
              value={operatorField.value}
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
              onChange={(event, value) => operatorHelpers.setValue(value)}
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
              value={expectedValueField.value}
              onChange={(event, value) => expectedValueHelpers.setValue(value)}
              aria-label={t`Expected value`}
            />
          </FormGroup>
        </ConditionFields>
      )}
    </>
  );
}
export default RunStep;
