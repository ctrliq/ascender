import React from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';

import { Tooltip } from '@patternfly/react-core';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';

const AlertText = styled.div`
  color: var(--pf-v6-global--danger-color--200);
  font-weight: var(--pf-v6-global--FontWeight--bold);
`;

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  margin-left: 10px;
`;

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
    <AlertText id={id}>
      {children}
      <Tooltip
        position="right"
        content={t`This step contains errors`}
        trigger="click mouseenter focus"
      >
        <ExclamationCircleIcon
          style={{
            color: 'var(--pf-t--global--color--status--danger--default)',
          }}
        />
      </Tooltip>
    </AlertText>
  );
}

export default StepName;
