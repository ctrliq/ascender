import React, { useContext } from 'react';
import { Title } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { msg } from '@lingui/macro';
import { WorkflowDispatchContext } from 'contexts/Workflow';
import LinkModal from './LinkModal';

function LinkAddModal() {
  const { i18n } = useLingui();
  const dispatch = useContext(WorkflowDispatchContext);
  return (
    <LinkModal
      header={
        <Title headingLevel="h1" size="xl">
          {i18n._(msg`Add Link`)}
        </Title>
      }
      onConfirm={(linkType) => dispatch({ type: 'CREATE_LINK', linkType })}
    />
  );
}

export default LinkAddModal;
