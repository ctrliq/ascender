import React from 'react';
import { Split, SplitItem } from '@patternfly/react-core';
import type { CodeEditorMode } from '../CodeEditor/CodeEditor';
import CodeEditor from '../CodeEditor';
import {
  EditorActions,
  fittedHeight,
  HeightModal,
  useEditorRows,
} from '../CodeEditor/EditorActions';
import Popover from '../Popover';
import './DetailList.css';

export interface CodeDetailProps {
  /** Null where the api sends one, which most message bodies do. */
  value?: string | null;
  label: React.ReactNode;
  mode: CodeEditorMode;
  rows?: number | 'auto';
  /**
   * Whether the box opens at its content height rather than at `rows`. A
   * caller that names a height gets that height on open unless it asks for
   * this, in which case `rows` becomes what the collapse arrow shrinks to.
   */
  startFitted?: boolean;
  helpText?: React.ReactNode;
  dataCy?: string;
  [key: string]: unknown;
}

function CodeDetail({
  value,
  label,
  mode,
  rows,
  startFitted,
  helpText = '',
  dataCy = '',
}: CodeDetailProps) {
  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;
  const editorId = dataCy ? `${dataCy}-editor` : 'code-editor';

  // Starts at the height the caller asked for and expands to fit, which is the
  // other way round from a job's variables. A caller passing startFitted turns
  // that back around: the box opens fitted, capped by MAX_UI_EDITOR_ROWS the
  // way every other editor is, and `rows` is where the arrow collapses it to.
  const height = useEditorRows(
    rows ?? 'auto',
    'auto',
    startFitted ?? rows === undefined
  );

  const text = value ?? '';
  const lineCount = text ? text.split('\n').length : 0;
  // Nothing to size on a value the box already shows whole.
  const isSizeable =
    typeof rows === 'number' ? lineCount > rows : lineCount > 0;

  return (
    <div className="ascender-code-detail">
      <Split
        hasGutter
        className="ascender-code-detail__label"
        data-cy={labelCy}
      >
        {/* Beside the label rather than out at the edge, as on the other
            editors. */}
        <SplitItem>
          <label htmlFor={editorId}>{label}</label>
          {helpText && (
            <Popover header={label} content={helpText} id={dataCy} />
          )}
        </SplitItem>
        <EditorActions
          dataCy={dataCy}
          copyValue={text}
          controls={editorId}
          isCollapsed={height.isCollapsed}
          isSizeable={isSizeable}
          onToggleCollapse={height.toggleCollapse}
          onSetHeight={height.openModal}
        />
      </Split>
      <div className="ascender-code-detail__editor" data-cy={valueCy}>
        <CodeEditor
          id={editorId}
          mode={mode}
          value={text}
          readOnly
          rows={isSizeable ? height.rows : rows}
        />
      </div>
      {height.isModalOpen && (
        <HeightModal
          dataCy={dataCy}
          value={
            typeof height.rows === 'number'
              ? height.rows
              : fittedHeight(lineCount)
          }
          onCancel={height.closeModal}
          onSave={height.chooseRows}
        />
      )}
    </div>
  );
}
export default CodeDetail;
