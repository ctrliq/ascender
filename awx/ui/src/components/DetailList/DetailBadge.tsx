import type { Untyped } from 'types/api';
import React from 'react';
import styled from 'styled-components';
import { Badge } from '@patternfly/react-core';

import _Detail from './Detail';

const Detail = styled(_Detail)`
  word-break: break-word;
`;

export interface DetailBadgeProps {
  label: React.ReactNode;
  helpText: Untyped;
  content: React.ReactNode;
  dataCy?: string;
  [key: string]: unknown;
}

function DetailBadge({
  label,
  helpText,
  content,
  dataCy,
}: DetailBadgeProps) {
  return (
    <Detail
      label={label}
      dataCy={dataCy}
      helpText={helpText}
      value={<Badge isRead>{content}</Badge>}
    />
  );
}

export default DetailBadge;
