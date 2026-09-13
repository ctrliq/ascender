import React from 'react';

import { classes } from './Detail';
import './DetailList.css';

export interface DetailListProps {
  children: React.ReactNode;
  stacked?: unknown;
  className?: string;
  [key: string]: unknown;
}

const DetailList = ({
  children,
  stacked,
  className,
  ...props
}: DetailListProps) => (
  <dl
    className={classes(
      'awx-detail-list',
      Boolean(stacked) && 'awx-detail-list--stacked',
      className
    )}
    {...props}
  >
    {children}
  </dl>
);

export default DetailList;
