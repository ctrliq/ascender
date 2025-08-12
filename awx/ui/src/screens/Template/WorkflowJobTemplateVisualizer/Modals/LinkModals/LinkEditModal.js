import React, { useContext } from 'react';
import { Title } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import { WorkflowDispatchContext } from 'contexts/Workflow';
import LinkModal from './LinkModal';

function LinkEditModal() {
  const { t } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  return (
    <LinkModal
      header={
        <Title headingLevel="h1" size="xl">
          {t`Edit Link`}
        </Title>
      }
      onConfirm={(linkType) => dispatch({ type: 'UPDATE_LINK', linkType })}
    />
  );
}

export default LinkEditModal;
