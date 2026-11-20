import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Split, SplitItem } from '@patternfly/react-core';
import { yamlToJson, jsonToYaml, isJsonObject, isJsonString } from 'util/yaml';
import MultiButtonToggle from '../MultiButtonToggle';
import Popover from '../Popover';
import CodeEditor from './CodeEditor';
import {
  EditorActions,
  fittedHeight,
  HeightModal,
  useEditorRows,
} from './EditorActions';
import { JSON_MODE, YAML_MODE } from './constants';
import type { VariablesMode } from './constants';
import './VariablesDetail.css';

export interface VariablesDetailProps {
  dataCy?: string;
  helpText?: React.ReactNode;
  /**
   * The variables, as the API returns them: a YAML or JSON string, or the
   * parsed object for an endpoint that returns one.
   */
  value?: string | Record<string, unknown> | null;
  label: React.ReactNode;
  rows?: number | 'auto';
  minRows?: number;
  name: string;
  [key: string]: unknown;
}

function VariablesDetail({
  dataCy = '',
  helpText = '',
  value,
  label,
  rows = 'auto',
  minRows = 4,
  name,
}: VariablesDetailProps) {
  const { t } = useLingui();

  const [mode, setMode] = useState(
    isJsonObject(value) || isJsonString(value) ? JSON_MODE : YAML_MODE
  );
  // Starts fitted to the value and collapses to minRows: a detail page holds
  // one or two of these, so opening them is the useful default.
  const height = useEditorRows(minRows, rows, true);

  let currentValue = value as string;
  let error: Error | undefined;

  const getValueInCurrentMode = () => {
    if (!value) {
      if (mode === JSON_MODE) {
        return '{}';
      }
      return '---';
    }
    const modeMatches = isJsonString(value as string) === (mode === JSON_MODE);
    if (modeMatches) {
      if (mode === JSON_MODE) {
        return JSON.stringify(JSON.parse(value as string), null, 2);
      }
      return value as string;
    }
    return mode === YAML_MODE
      ? jsonToYaml(value as string)
      : yamlToJson(value as string);
  };

  try {
    currentValue = getValueInCurrentMode();
  } catch (err) {
    error = err as Error;
  }

  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  // The editor wraps no lines, so a newline is a row and the row count is the
  // height the value asks for. Collapsing only means anything when that is more
  // than the collapsed height holds, and only when the box was growing to fit
  // in the first place: a caller that asked for a fixed number of rows already
  // decided the height. Counting the value in the mode on screen rather than
  // the raw one, because the two do not run to the same number of lines.
  const lineCount = currentValue ? currentValue.split('\n').length : 0;

  // A caller that asked for a fixed number of rows already decided the height,
  // so the controls only do something where the box was growing to fit.
  const isSizeable = rows === 'auto' && lineCount > minRows;
  const shownRows = isSizeable ? height.rows : rows;

  return (
    <div className="ascender-variables-detail__wrapper">
      <div
        className="ascender-variables-detail__label"
        data-cy={labelCy}
        id={dataCy}
      >
        <ModeToggle
          id={`${dataCy}-preview`}
          label={label}
          helpText={helpText}
          dataCy={dataCy}
          mode={mode}
          setMode={setMode}
          name={name}
          actions={
            <EditorActions
              dataCy={dataCy}
              copyValue={currentValue}
              controls={`${dataCy}-preview`}
              isCollapsed={height.isCollapsed}
              isSizeable={isSizeable}
              onToggleCollapse={height.toggleCollapse}
              onSetHeight={height.openModal}
            />
          }
        />
      </div>
      <div
        className="ascender-variables-detail__editor-wrapper"
        data-cy={valueCy}
      >
        <CodeEditor
          id={`${dataCy}-preview`}
          mode={mode}
          value={currentValue}
          readOnly
          rows={shownRows}
          minRows={minRows}
        />
      </div>
      {height.isModalOpen && (
        <HeightModal
          dataCy={dataCy}
          value={
            typeof shownRows === 'number' ? shownRows : fittedHeight(lineCount)
          }
          onCancel={height.closeModal}
          onSave={height.chooseRows}
        />
      )}
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
    </div>
  );
}
interface ModeToggleProps {
  id: string;
  label: React.ReactNode;
  helpText?: React.ReactNode;
  dataCy?: string;
  /** YAML_MODE or JSON_MODE, whichever the editor is showing. */
  mode: VariablesMode;
  setMode: (mode: VariablesMode) => void;
  name?: string;
  /** The copy, collapse and height buttons, which sit at the row's end. */
  actions?: React.ReactNode;
}

function ModeToggle({
  id,
  label,
  helpText,
  dataCy,
  mode,
  setMode,
  name,
  actions,
}: ModeToggleProps) {
  return (
    <Split hasGutter>
      {/* Not filled: the actions sit beside the mode toggle rather than out at
          the edge of a wide row, which is where the eye already is. */}
      <SplitItem>
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
      {/* The first item fills, so these sit against the right edge of the
          label row, which is the top right corner of the editor below it. */}
      {actions}
    </Split>
  );
}

export default VariablesDetail;
