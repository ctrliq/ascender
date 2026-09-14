import React from 'react';
import { Td } from '@patternfly/react-table';
import './TdBreakWord.css';

export interface TdBreakWordProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

export default function TdBreakWord({
  children,
  className,
  ...props
}: TdBreakWordProps) {
  return (
    <Td
      className={['ascender-td-break-word__td', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </Td>
  );
}
