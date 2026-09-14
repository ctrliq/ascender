import React from 'react';

import './JobEventLineText.css';

export interface JobEventLineTextProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const JobEventLineText = ({
  className,
  children,
  ...props
}: JobEventLineTextProps) => (
  <div
    className={['awx-job-event-line-text', className].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default JobEventLineText;
