import React from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Button as PFButton,
  ToolbarItem as PFToolbarItem,
} from '@patternfly/react-core';
import { BarsIcon, EqualsIcon } from '@patternfly/react-icons';
import styled from 'styled-components';

const Button = styled(PFButton)`
  padding: 0;
  margin: 0;
  height: 30px;
  width: 30px;
  ${(props) =>
    props.isActive
      ? `
      background-color: #007bba;
      --pf-c-button--m-plain--active--Color: white;
      --pf-c-button--m-plain--focus--Color: white;`
      : null};
`;

const ToolbarItem = styled(PFToolbarItem)`
  & :not(:last-child) {
    margin-right: 20px;
  }
`;

// TODO: Recommend renaming this component to avoid confusion
// with ExpandingContainer
function ExpandCollapse({ isCompact, onCompact, onExpand }) {
  const { i18n } = useLingui();
  return (
    <>
      <ToolbarItem>
        <Button
          ouiaId="toolbar-collapse-button"
          variant="plain"
          aria-label={i18n._(msg`Collapse`)}
          onClick={onCompact}
          isActive={isCompact}
        >
          <BarsIcon />
        </Button>
      </ToolbarItem>
      <ToolbarItem>
        <Button
          ouiaId="toolbar-expand-button"
          variant="plain"
          aria-label={i18n._(msg`Expand`)}
          onClick={onExpand}
          isActive={!isCompact}
        >
          <EqualsIcon />
        </Button>
      </ToolbarItem>
    </>
  );
}

ExpandCollapse.propTypes = {
  onCompact: PropTypes.func.isRequired,
  onExpand: PropTypes.func.isRequired,
  isCompact: PropTypes.bool,
};

ExpandCollapse.defaultProps = {
  isCompact: true,
};

export default ExpandCollapse;
