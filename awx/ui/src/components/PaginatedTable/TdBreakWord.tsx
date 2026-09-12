import React from 'react';
import { Td as _Td } from '@patternfly/react-table';
import styled from 'styled-components';

const Td = styled(_Td)`
  && {
    word-break: break-all;
  }
`;

export interface TdBreakWordProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

export default function TdBreakWord({ children, ...props }: TdBreakWordProps) {
  return <Td {...props}>{children}</Td>;
}
