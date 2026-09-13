import React from 'react';
import type { CodeEditorMode } from '../CodeEditor/CodeEditor';
import CodeEditor from '../CodeEditor';
import Popover from '../Popover';
import './DetailList.css';

export interface CodeDetailProps {
  /** Null where the api sends one, which most message bodies do. */
  value?: string | null;
  label: React.ReactNode;
  mode: CodeEditorMode;
  rows?: number | 'auto';
  helpText?: React.ReactNode;
  dataCy?: string;
  [key: string]: unknown;
}

function CodeDetail({
  value,
  label,
  mode,
  rows,
  helpText = '',
  dataCy = '',
}: CodeDetailProps) {
  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;
  const editorId = dataCy ? `${dataCy}-editor` : 'code-editor';

  return (
    <div className="awx-code-detail">
      <div className="awx-code-detail__label" data-cy={labelCy}>
        <label htmlFor={editorId}>{label}</label>
        {helpText && <Popover header={label} content={helpText} id={dataCy} />}
      </div>
      <div className="awx-code-detail__editor" data-cy={valueCy}>
        <CodeEditor
          id={editorId}
          mode={mode}
          value={value ?? ''}
          readOnly
          rows={rows}
        />
      </div>
    </div>
  );
}
export default CodeDetail;
