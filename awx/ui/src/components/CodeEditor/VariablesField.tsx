import type { Untyped } from 'types/api';
import React, { useState, useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useField } from 'formik';
import type { FieldValidator } from 'formik';
import styled from 'styled-components';
import { Split, SplitItem } from '@patternfly/react-core';
import {
  yamlToJson,
  jsonToYaml,
  isJsonString,
  parseVariableField,
} from 'util/yaml';
import { CheckboxField } from '../FormField';
import MultiButtonToggle from '../MultiButtonToggle';
import CodeEditor from './CodeEditor';
import Popover from '../Popover';
import { JSON_MODE, YAML_MODE } from './constants';

const FieldHeader = styled.div`
  display: flex;
  justify-content: space-between;
  padding-bottom: var(--pf-v6-c-form__group-label--PaddingBottom);
`;

const StyledCheckboxField = styled(CheckboxField)`
  --pf-v6-c-check__label--FontSize: var(--pf-v6-c-form__label--FontSize);
  margin-left: auto;
`;

const defaultValidators = {};

export interface VariablesFieldProps {
  id: string;
  name: string;
  label: React.ReactNode;
  readOnly?: boolean;
  /** Id of the "prompt on launch" checkbox rendered beside the label. */
  promptId?: string | null;
  tooltip?: React.ReactNode;
  /** YAML_MODE or JSON_MODE, which is how the editor opens. */
  initialMode?: string;
  onModeChange?: (mode: string) => void;
  isRequired?: boolean;
  validators?: Record<string, Untyped>;
}

function VariablesField({
  id,
  name,
  label,
  readOnly = false,
  promptId = null,
  tooltip,
  initialMode = YAML_MODE,
  onModeChange = () => {},
  isRequired = false,
  validators = defaultValidators,
}: VariablesFieldProps) {
  // track focus manually, because the Code Editor library doesn't wire
  // into Formik completely
  const [shouldValidate, setShouldValidate] = useState(false);
  const validate = useCallback(
    (value: string) => {
      if (!shouldValidate) {
        return undefined;
      }
      try {
        const parsedVariables = parseVariableField(value);
        if (validators) {
          const errorMessages = Object.keys(validators)
            .map((field) => validators[field](parsedVariables[field]))
            .filter((e) => e);

          if (errorMessages.length > 0) {
            return errorMessages;
          }
        }
      } catch (error) {
        return (error as Error).message;
      }
      return undefined;
    },
    [shouldValidate, validators]
  );
  // validate returns an array when several validators fail, which is not what
  // formik's own type describes but is what this field has always put in
  // meta.error, and what the header below renders.
  const [field, meta, helpers] = useField({
    name,
    validate: validate as unknown as FieldValidator,
  });
  const [mode, setMode] = useState(() =>
    isJsonString(field.value) ? JSON_MODE : initialMode || YAML_MODE
  );

  useEffect(
    () => {
      if (shouldValidate) {
        const error = validate(field.value);
        helpers.setError(error as unknown as string);
      }
    },
    [shouldValidate, field.value] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [lastYamlValue, setLastYamlValue] = useState(
    mode === YAML_MODE ? field.value : null
  );
  const [isJsonEdited, setIsJsonEdited] = useState(false);

  const handleModeChange = (newMode: string) => {
    if (newMode === YAML_MODE && !isJsonEdited && lastYamlValue !== null) {
      helpers.setValue(lastYamlValue, false);
      setMode(newMode);
      onModeChange(newMode);
      return;
    }

    try {
      const newVal =
        newMode === YAML_MODE
          ? jsonToYaml(field.value)
          : yamlToJson(field.value);
      helpers.setValue(newVal, false);
      setMode(newMode);
      onModeChange(newMode);
    } catch (err) {
      helpers.setError((err as Error).message);
    }
  };

  const handleChange = (newVal: string) => {
    helpers.setValue(newVal);
    if (mode === JSON_MODE) {
      setIsJsonEdited(true);
    } else {
      setLastYamlValue(newVal);
      setIsJsonEdited(false);
    }
  };

  return (
    <div>
      <VariablesFieldInternals
        id={id}
        name={name}
        label={label}
        readOnly={readOnly}
        promptId={promptId}
        tooltip={tooltip}
        mode={mode}
        setMode={handleModeChange}
        setShouldValidate={setShouldValidate}
        handleChange={handleChange}
        isRequired={isRequired}
      />
      {meta.error ? (
        <div
          className="pf-v6-c-form__helper-text pf-m-error"
          aria-live="polite"
        >
          {(Array.isArray(meta.error) ? meta.error : [meta.error]).map(
            (errorMessage) => (
              <p key={errorMessage}>{errorMessage}</p>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
export interface VariablesFieldInternalsProps {
  id: string;
  name: string;
  label: React.ReactNode;
  readOnly: boolean;
  promptId?: number | string | null;
  tooltip: React.ReactNode;
  mode: Untyped;
  setMode: Untyped;
  setShouldValidate: (shouldValidate: boolean) => void;
  handleChange: (...args: Untyped[]) => void;
  isRequired: boolean;
  [key: string]: unknown;
}

function VariablesFieldInternals({
  id,
  name,
  label,
  readOnly,
  promptId,
  tooltip,
  mode,
  setMode,
  setShouldValidate,
  handleChange,
  isRequired,
}: VariablesFieldInternalsProps) {
  const { t } = useLingui();
  const [field, meta, helpers] = useField(name);

  useEffect(() => {
    if (mode === YAML_MODE) {
      return;
    }
    try {
      helpers.setValue(JSON.stringify(JSON.parse(field.value), null, 2));
    } catch (e) {
      helpers.setError((e as Error).message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pf-v6-c-form__group">
      <FieldHeader data-cy={`${id}-label`}>
        <Split hasGutter>
          <SplitItem>
            <label htmlFor={id} className="pf-v6-c-form__label">
              <span className="pf-v6-c-form__label-text">{label}</span>
              {isRequired && (
                <span
                  className="pf-v6-c-form__label-required"
                  aria-hidden="true"
                >
                  {' '}
                  *{' '}
                </span>
              )}
            </label>
            {tooltip && <Popover content={tooltip} id={`${id}-tooltip`} />}
          </SplitItem>
          <SplitItem>
            <MultiButtonToggle
              buttons={[
                [YAML_MODE, 'YAML'],
                [JSON_MODE, 'JSON'],
              ]}
              value={mode}
              onChange={setMode}
              name={name}
            />
          </SplitItem>
        </Split>
        {promptId && (
          <StyledCheckboxField
            id="template-ask-variables-on-launch"
            label={t`Prompt on launch`}
            name="ask_variables_on_launch"
          />
        )}
      </FieldHeader>
      <CodeEditor
        id={id}
        mode={mode}
        readOnly={readOnly}
        {...field}
        onChange={handleChange}
        rows="auto"
        minRows={4}
        onFocus={() => setShouldValidate(false)}
        onBlur={() => setShouldValidate(true)}
        hasErrors={!!meta.error}
      />
    </div>
  );
}

export default VariablesField;
