import React from 'react';
import { Badge } from '@patternfly/react-core';

import Detail from './Detail';
import './DetailList.css';

export interface DetailBadgeProps {
  label: React.ReactNode;
  helpText?: React.ReactNode;
  content: React.ReactNode;
  dataCy?: string;
  [key: string]: unknown;
}

function DetailBadge({ label, helpText, content, dataCy }: DetailBadgeProps) {
  return (
    <Detail
      className="awx-detail--break-word"
      label={label}
      dataCy={dataCy}
      helpText={helpText}
      value={<Badge isRead>{content}</Badge>}
    />
  );
}

export default DetailBadge;
