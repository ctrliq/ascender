import React from 'react';

import './JobEventLine.css';

export interface JobEventLineProps {
  /** A clickable line is one whose event can be expanded, so it gets a pointer. */
  $isClickable?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const JobEventLine = ({
  $isClickable = false,
  className,
  children,
  ...props
}: JobEventLineProps) => (
  <div
    className={[
      'ascender-job-event-line',
      $isClickable && 'ascender-job-event-line--clickable',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default JobEventLine;
