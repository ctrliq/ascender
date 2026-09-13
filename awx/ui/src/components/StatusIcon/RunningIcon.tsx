import React from 'react';
import { SyncAltIcon } from '@patternfly/react-icons';

import './RunningIcon.css';

export interface RunningIconProps {
  className?: string;
  [key: string]: unknown;
}

/** The running status icon, which turns for as long as the job does. */
const RunningIcon = ({ className, ...props }: RunningIconProps) => (
  <SyncAltIcon
    className={['awx-running-icon', className].filter(Boolean).join(' ')}
    {...props}
  />
);

export default RunningIcon;
