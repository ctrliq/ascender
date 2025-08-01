import React from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
import { shape } from 'prop-types';

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
  const { i18n } = useLingui();
  let linkType;
  switch (link.linkType) {
    case 'always':
      linkType = i18n._(msg`Always`);
      break;
    case 'success':
      linkType = i18n._(msg`On Success`);
      break;
    case 'failure':
      linkType = i18n._(msg`On Failure`);
      break;
    default:
      linkType = '';
  }

  return (
    <GridDL>
      <dt>
        <b>{i18n._(msg`Run`)}</b>
      </dt>
      <dd id="workflow-link-help-type">{linkType}</dd>
    </GridDL>
  );
}

WorkflowLinkHelp.propTypes = {
  link: shape().isRequired,
};

export default WorkflowLinkHelp;
