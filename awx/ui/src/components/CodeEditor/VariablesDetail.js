import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
	Split,
	SplitItem,
	Button
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';
import { ExpandArrowsAltIcon } from '@patternfly/react-icons';
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
  rows = null,
  fullHeight,
  name,
}) {
  const { t } = useLingui();

  const [mode, setMode] = useState(
    isJsonObject(value) || isJsonString(value) ? JSON_MODE : YAML_MODE
  );
  const [isExpanded, setIsExpanded] = useState(false);

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
    <>
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
            onExpand={() => setIsExpanded(true)}
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
            fullHeight={fullHeight}
          />
        </EditorWrapper>
        {error && (
          <div style={{ color: 'var(--pf-t--global--color--status--danger--default)', marginTop: '0.5rem' }}>
            {t`Error:`} {error.message}
          </div>
        )}
      </VariablesWrapper>
      <Modal
        variant="xlarge"
        title={label}
        ouiaId={`${dataCy}-modal`}
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        actions={[
          <Button
            aria-label={t`Done`}
            key="select"
            variant="primary"
            onClick={() => setIsExpanded(false)}
            ouiaId={`${dataCy}-unexpand`}
          >
            {t`Done`}
          </Button>,
        ]}
      >
        <div className="pf-v6-c-form">
          <ModeToggle
            id={`${dataCy}-preview-expanded`}
            label={label}
            helpText={helpText}
            dataCy={dataCy}
            mode={mode}
            setMode={setMode}
            currentValue={currentValue}
            name={name}
          />
          <CodeEditor
            id={`${dataCy}-preview-expanded`}
            mode={mode}
            value={currentValue}
            readOnly
            rows={rows}
            fullHeight
            css="margin-top: 10px"
          />
        </div>
      </Modal>
    </>
  );
}
function ModeToggle({
  id,
  label,
  helpText,
  dataCy,
  mode,
  setMode,
  onExpand,
  name,
}) {
  const { t } = useLingui();
  return (
    <Split hasGutter>
      <SplitItem isFilled>
        <Split hasGutter style={{ alignItems: 'baseline' }}>
          <SplitItem>
            <label className="pf-v6-c-form__label" htmlFor={id}>
              <span
                className="pf-v6-c-form__label-text"
                style={{ fontWeight: 'var(--pf-t--global--font--weight--heading--bold)' }}
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
      {onExpand && (
        <SplitItem>
          <Button icon={<ExpandArrowsAltIcon />}
            variant="plain"
            aria-label={t`Expand input`}
            onClick={onExpand}
            ouiaId={`${dataCy}-expand`}
           />
        </SplitItem>
      )}
    </Split>
  );
}

export default VariablesDetail;
