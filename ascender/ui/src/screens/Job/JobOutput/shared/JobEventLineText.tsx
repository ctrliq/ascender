import React from 'react';

import './JobEventLineText.css';

export interface JobEventLineTextProps {
  /**
   * Whether this line's event can be opened, which is what gives it a pointer.
   * The text carries it rather than the row, so the pointer stops where the
   * text does instead of running to the far side of the output.
   */
  $isClickable?: boolean;
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const JobEventLineText = ({
  $isClickable = false,
  className,
  children,
  ...props
}: JobEventLineTextProps) => (
  <div
    className={[
      'ascender-job-event-line-text',
      $isClickable && 'ascender-job-event-line-text--clickable',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default JobEventLineText;
