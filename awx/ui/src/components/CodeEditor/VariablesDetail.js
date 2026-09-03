import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Split, SplitItem } from '@patternfly/react-core';
import styled from 'styled-components';
import { yamlToJson, jsonToYaml, isJsonObject, isJsonString } from 'util/yaml';
import MultiButtonToggle from '../MultiButtonToggle';
import Popover from '../Popover';
import CodeEditor from './CodeEditor';
import { JSON_MODE, YAML_MODE } from './constants';

const VariablesWrapper = styled.div`
  grid-column: 1 / -1;
  padding: 1.25rem 0 0.875rem;
`;

const VariablesLabel = styled.div`
  font-size: var(--pf-v6-global--FontSize--xs);
  font-weight: var(--pf-v6-global--FontWeight--bold);
  color: var(--pf-v6-global--Color--200);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.5rem;
`;

const EditorWrapper = styled.div`
  border: 1px solid var(--pf-v6-global--BorderColor--100);
  border-radius: var(--pf-v6-global--BorderRadius--sm);
  overflow: hidden;
`;

function VariablesDetail({
  dataCy = '',
  helpText = '',
  value,
  label,
  rows = 'auto',
  minRows = 4,
  name,
}) {
  const { t } = useLingui();

  const [mode, setMode] = useState(
    isJsonObject(value) || isJsonString(value) ? JSON_MODE : YAML_MODE
  );

  let currentValue = value;
  let error;

  const getValueInCurrentMode = () => {
    if (!value) {
      if (mode === JSON_MODE) {
        return '{}';
      }
      return '---';
    }
    const modeMatches = isJsonString(value) === (mode === JSON_MODE);
    if (modeMatches) {
      if (mode === JSON_MODE) {
        return JSON.stringify(JSON.parse(value), null, 2);
      }
      return value;
    }
    return mode === YAML_MODE ? jsonToYaml(value) : yamlToJson(value);
  };

  try {
    currentValue = getValueInCurrentMode();
  } catch (err) {
    error = err;
  }

  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  return (
    <VariablesWrapper>
      <VariablesLabel data-cy={labelCy} id={dataCy}>
        <ModeToggle
          id={`${dataCy}-preview`}
          label={label}
          helpText={helpText}
          dataCy={dataCy}
          mode={mode}
          setMode={setMode}
          currentValue={currentValue}
          name={name}
        />
      </VariablesLabel>
      <EditorWrapper data-cy={valueCy}>
        <CodeEditor
          id={`${dataCy}-preview`}
          mode={mode}
          value={currentValue}
          readOnly
          rows={rows}
          minRows={minRows}
        />
      </EditorWrapper>
      {error && (
        <div
          style={{
            color: 'var(--pf-t--global--color--status--danger--default)',
            marginTop: '0.5rem',
          }}
        >
          {t`Error:`} {error.message}
        </div>
      )}
    </VariablesWrapper>
  );
}
function ModeToggle({ id, label, helpText, dataCy, mode, setMode, name }) {
  return (
    <Split hasGutter>
      <SplitItem isFilled>
        <Split hasGutter style={{ alignItems: 'baseline' }}>
          <SplitItem>
            <label className="pf-v6-c-form__label" htmlFor={id}>
              <span
                className="pf-v6-c-form__label-text"
                style={{
                  fontWeight:
                    'var(--pf-t--global--font--weight--heading--bold)',
                }}
              >
                {label}
              </span>
              {helpText && (
                <Popover header={label} content={helpText} id={dataCy} />
              )}
            </label>
          </SplitItem>
          <SplitItem>
            <MultiButtonToggle
              buttons={[
                [YAML_MODE, 'YAML'],
                [JSON_MODE, 'JSON'],
              ]}
              value={mode}
              onChange={(newMode) => {
                setMode(newMode);
              }}
              name={name}
            />
          </SplitItem>
        </Split>
      </SplitItem>
    </Split>
  );
}

export default VariablesDetail;
