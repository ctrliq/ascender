import React from 'react';

import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';

const GridDL = styled.dl`
  column-gap: 15px;
  display: grid;
  grid-template-columns: max-content;
  row-gap: 0px;
  dt {
    grid-column-start: 1;
  }
  dd {
    grid-column-start: 2;
  }
`;

function WorkflowLinkHelp({ link }) {
  const { t } = useLingui();
  let linkType;
  switch (link.linkType) {
    case 'always':
      linkType = t`Always`;
      break;
    case 'success':
      linkType = t`On Success`;
      break;
    case 'failure':
      linkType = t`On Failure`;
      break;
    case 'condition':
      linkType = t`On Condition`;
      break;
    default:
      linkType = '';
  }

  let triggerLabel;
  switch (link.linkCondition?.trigger) {
    case 'failure':
      triggerLabel = t`On Failure`;
      break;
    case 'always':
      triggerLabel = t`Always`;
      break;
    default:
      triggerLabel = t`On Success`;
  }

  return (
    <GridDL>
      <dt>
        <b>{t`Run`}</b>
      </dt>
      <dd id="workflow-link-help-type">{linkType}</dd>
      {link.linkType === 'condition' && link.linkCondition && (
        <>
          <dt>
            <b>{t`Evaluate on`}</b>
          </dt>
          <dd id="workflow-link-help-trigger">{triggerLabel}</dd>
          <dt>
            <b>{t`Condition`}</b>
          </dt>
          <dd id="workflow-link-help-condition">
            {`${link.linkCondition.artifact_key} ${
              link.linkCondition.operator === 'ne' ? '!=' : '=='
            } ${link.linkCondition.expected_value}`}
          </dd>
        </>
      )}
    </GridDL>
  );
}

export default WorkflowLinkHelp;
