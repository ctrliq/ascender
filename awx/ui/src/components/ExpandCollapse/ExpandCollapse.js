import React from 'react';
import PropTypes from 'prop-types';

import { useLingui } from '@lingui/react/macro';
import {
  Button as PFButton,
  ToolbarItem as PFToolbarItem,
} from '@patternfly/react-core';
import { LucideIconMenu, LucideIconEqual } from '@ctrliq/quantic-react';
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
  const { t } = useLingui();
  return (
    <>
      <ToolbarItem>
        <Button
          ouiaId="toolbar-collapse-button"
          variant="plain"
          aria-label={t`Collapse`}
          onClick={onCompact}
          isActive={isCompact}
        >
          <LucideIconMenu size="xs" data-original-icon="BarsIcon" />
        </Button>
      </ToolbarItem>
      <ToolbarItem>
        <Button
          ouiaId="toolbar-expand-button"
          variant="plain"
          aria-label={t`Expand`}
          onClick={onExpand}
          isActive={!isCompact}
        >
          <LucideIconEqual size="xs" data-original-icon="EqualsIcon" />
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
