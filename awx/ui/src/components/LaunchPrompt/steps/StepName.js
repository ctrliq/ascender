import React from 'react';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';

import { msg } from '@lingui/macro';
import { Tooltip } from '@patternfly/react-core';
import { ExclamationCircleIcon as PFExclamationCircleIcon } from '@patternfly/react-icons';

const AlertText = styled.div`
  color: var(--pf-global--danger-color--200);
  font-weight: var(--pf-global--FontWeight--bold);
`;

const ExclamationCircleIcon = styled(PFExclamationCircleIcon)`
  margin-left: 10px;
`;

function StepName({ hasErrors, children, id }) {
  const { i18n } = useLingui();
  if (!hasErrors) {
    return <div id={id}>{children}</div>;
  }
  return (
    <AlertText id={id}>
      {children}
      <Tooltip
        position="right"
        content={i18n._(msg`This step contains errors`)}
        trigger="click mouseenter focus"
      >
        <ExclamationCircleIcon css="color: var(--pf-global--danger-color--100)" />
      </Tooltip>
    </AlertText>
  );
}

export default StepName;
