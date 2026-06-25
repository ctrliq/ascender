import React from 'react';
import { TextListItemVariants } from '@patternfly/react-core';
import { DetailName, DetailValue } from './Detail';
import CodeEditor from '../CodeEditor';
import Popover from '../Popover';

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
    <>
      <DetailName
        component={TextListItemVariants.dt}
        fullWidth
        css="grid-column: 1 / -1"
        data-cy={labelCy}
      >
        <div className="pf-v5-c-form__label">
          <label
            htmlFor={editorId}
            className="pf-v5-c-form__label-text"
            css="font-weight: var(--pf-v5-global--FontWeight--bold)"
          >
            {label}
          </label>
          {helpText && (
            <Popover header={label} content={helpText} id={dataCy} />
          )}
        </div>
      </DetailName>
      <DetailValue
        component={TextListItemVariants.dd}
        fullWidth
        css="grid-column: 1 / -1; margin-top: -20px"
        data-cy={valueCy}
      >
        <CodeEditor
          id={editorId}
          mode={mode}
          value={value}
          readOnly
          rows={rows}
          css="margin-top: 10px"
        />
      </DetailValue>
    </>
  );
}
export default CodeDetail;
