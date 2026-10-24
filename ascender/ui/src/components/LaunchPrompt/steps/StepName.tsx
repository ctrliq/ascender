import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';
import './StepName.css';
import Tooltip from '../../Tooltip';

export interface StepNameProps {
  hasErrors?: boolean;
  children: React.ReactNode;
  id: string;
  [key: string]: unknown;
}

function StepName({ hasErrors, children, id }: StepNameProps) {
  const { t } = useLingui();
  if (!hasErrors) {
    return <div id={id}>{children}</div>;
  }
  return (
    <div className="ascender-step-name__alert-text" id={id}>
      {children}
      <Tooltip
        content={t`This step contains errors`}
        trigger="click mouseenter focus"
      >
        <PFExclamationCircleIcon
          className="ascender-step-name__exclamation-circle-icon"
          style={{
            color: 'var(--pf-t--global--color--status--danger--default)',
          }}
        />
      </Tooltip>
    </div>
  );
}

export default StepName;
