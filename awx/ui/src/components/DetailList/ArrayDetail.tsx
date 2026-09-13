import React from 'react';
import { DetailName, DetailValue } from './Detail';
import './DetailList.css';
import Popover from '../Popover';

export interface ArrayDetailProps {
  label: React.ReactNode;
  helpText: React.ReactNode;
  value: unknown;
  dataCy: string;
  [key: string]: unknown;
}

function ArrayDetail({ label, helpText, value, dataCy }: ArrayDetailProps) {
  const labelCy = dataCy ? `${dataCy}-label` : null;
  const valueCy = dataCy ? `${dataCy}-value` : null;

  const vals = Array.isArray(value) ? value : [value];

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <DetailName data-cy={labelCy}>
        {label}
        {helpText && <Popover header={label} content={helpText} id={dataCy} />}
      </DetailName>
      <DetailValue className="awx-detail-value--array" data-cy={valueCy}>
        {vals.map((v) => (
          <div key={v}>{v}</div>
        ))}
      </DetailValue>
    </div>
  );
}

export default ArrayDetail;
