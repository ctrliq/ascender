import React from 'react';
import styled from 'styled-components';
import CodeEditor from '../CodeEditor';
import Popover from '../Popover';

const CodeWrapper = styled.div`
  grid-column: 1 / -1;
  padding: 1.25rem 0 0.875rem;
`;

const CodeLabel = styled.div`
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

function CodeDetail({
  value,
  label,
  mode,
  rows = null,
  helpText = '',
  dataCy = '',
}) {
  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;
  const editorId = dataCy ? `${dataCy}-editor` : 'code-editor';

  return (
    <CodeWrapper>
      <CodeLabel data-cy={labelCy}>
        <label htmlFor={editorId}>
          {label}
        </label>
        {helpText && (
          <Popover header={label} content={helpText} id={dataCy} />
        )}
      </CodeLabel>
      <EditorWrapper data-cy={valueCy}>
        <CodeEditor
          id={editorId}
          mode={mode}
          value={value}
          readOnly
          rows={rows}
        />
      </EditorWrapper>
    </CodeWrapper>
  );
}
export default CodeDetail;
