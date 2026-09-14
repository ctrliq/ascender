import React from 'react';

import './JobEventLineNumber.css';

export interface JobEventLineNumberProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const JobEventLineNumber = ({
  className,
  children,
  ...props
}: JobEventLineNumberProps) => (
  <div
    className={['ascender-job-event-line-number', className]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default JobEventLineNumber;
