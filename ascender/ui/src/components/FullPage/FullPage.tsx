import React from 'react';

import './FullPage.css';

export interface FullPageProps {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

/** A fixed backdrop covering the viewport, used by the visualizer. */
const FullPage = ({ className, children, ...props }: FullPageProps) => (
  <div
    className={['awx-full-page', className].filter(Boolean).join(' ')}
    {...props}
  >
    {children}
  </div>
);

export default FullPage;
