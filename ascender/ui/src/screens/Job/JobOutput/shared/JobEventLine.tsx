import React from 'react';

import './JobEventLine.css';

export interface JobEventLineProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const JobEventLine = ({ className, children, ...props }: JobEventLineProps) => (
  <div
    className={['ascender-job-event-line', className].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default JobEventLine;
