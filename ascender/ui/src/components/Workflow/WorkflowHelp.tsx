import React from 'react';
import './WorkflowHelp.css';

export interface WorkflowHelpProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

function WorkflowHelp({ children }: WorkflowHelpProps) {
  return (
    <div className="ascender-workflow-help__outer">
      <div className="ascender-workflow-help__inner">{children}</div>
    </div>
  );
}

export default WorkflowHelp;
