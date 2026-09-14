import React from 'react';
import './JobEventEllipsis.css';

export interface JobEventEllipsisProps {
  isCollapsed: boolean;
  [key: string]: unknown;
}

export default function JobEventEllipsis({
  isCollapsed,
}: JobEventEllipsisProps) {
  if (!isCollapsed) {
    return null;
  }

  return <div className="ascender-job-event-ellipsis__wrapper">...</div>;
}
