import React, { useContext } from 'react';
import { Title } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';

import { WorkflowDispatchContext } from 'contexts/Workflow';
import LinkModal from './LinkModal';

function LinkEditModal() {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  return (
    <LinkModal
      header={
        <Title headingLevel="h1" size="xl">
          {i18n._(t`Edit Link`)}
        </Title>
      }
      onConfirm={(linkType) => dispatch({ type: 'UPDATE_LINK', linkType })}
    />
  );
}

export default LinkEditModal;
