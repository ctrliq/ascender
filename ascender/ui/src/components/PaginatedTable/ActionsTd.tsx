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
  /*
   * Every child gets a slot of its own, the hidden ones included: an ActionItem
   * a row may not use renders nothing, and without the slot the actions after
   * it slid left into its place. A list with a sync button on some rows and
   * not on others then had its edit button under the sync column on those
   * rows. Children.map calls back for a null child too, so a conditional
   * action keeps its place the same way.
   */
  const slots = React.Children.map(children, (child) => (
    <div className="ascender-actions-td__slot">{child}</div>
  ));
  return (
    <Td
      className={['ascender-actions-td__cell', className]
        .filter(Boolean)
        .join(' ')}
      style={
        { '--pf-v6-c-table--cell--Width': `${width}px` } as React.CSSProperties
      }
      {...props}
    >
      <div className="ascender-actions-td__grid">{slots}</div>
    </Td>
  );
}
