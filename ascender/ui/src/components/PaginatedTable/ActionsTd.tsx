import React from 'react';
import { Td } from '@patternfly/react-table';
import './ActionsTd.css';

export interface ActionsTdProps {
  children: React.ReactNode;
  gridColumns?: unknown;
  className?: string;
  [key: string]: unknown;
}

export default function ActionsTd({
  children,
  gridColumns: _gridColumns,
  className,
  ...props
}: ActionsTdProps) {
  const numActions = React.Children.count(children) || 1;
  const width = numActions * 40;
  return (
    <Td
      className={['awx-actions-td__cell', className].filter(Boolean).join(' ')}
      style={
        { '--pf-v6-c-table--cell--Width': `${width}px` } as React.CSSProperties
      }
      {...props}
    >
      <div className="awx-actions-td__grid">{children}</div>
    </Td>
  );
}
