import React from 'react';
import styled from 'styled-components';
import { DetailName, DetailValue } from './Detail';
import Popover from '../Popover';

const Value = styled(DetailValue)`
  margin-top: var(--pf-v6-global--spacer--xs);
  padding: var(--pf-v6-global--spacer--xs);
  border: 1px solid var(--pf-v6-global--BorderColor--100);
  max-height: 5.5em;
  overflow: auto;
`;

function ArrayDetail({ label, helpText, value, dataCy }) {
  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  const vals = Array.isArray(value) ? value : [value];

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <DetailName data-cy={labelCy}>
        {label}
        {helpText && <Popover header={label} content={helpText} id={dataCy} />}
      </DetailName>
      <Value data-cy={valueCy}>
        {vals.map((v) => (
          <div key={v}>{v}</div>
        ))}
      </Value>
    </div>
  );
}

export default ArrayDetail;
