import React from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Button as PFButton,
  ToolbarItem as PFToolbarItem,
} from '@patternfly/react-core';
import { BarsIcon, EqualsIcon } from '@patternfly/react-icons';
import './ExpandCollapse.css';

// TODO: Recommend renaming this component to avoid confusion
// with ExpandingContainer
/** The toggle that is showing its own layout carries the active colours. */
const buttonClass = (isActive: boolean) =>
  isActive
    ? 'ascender-expand-collapse__button ascender-expand-collapse__button--active'
    : 'ascender-expand-collapse__button';

export interface ExpandCollapseProps {
  isCompact?: boolean;
  onCompact: () => void;
  onExpand: () => void;
  [key: string]: unknown;
}

function ExpandCollapse({
  isCompact = true,
  onCompact,
  onExpand,
}: ExpandCollapseProps) {
  const { t } = useLingui();
  return (
    <>
      <PFToolbarItem className="ascender-expand-collapse__toolbar-item">
        <PFButton
          ouiaId="toolbar-collapse-button"
          variant="plain"
          aria-label={t`Collapse`}
          onClick={onCompact}
          className={buttonClass(isCompact)}
        >
          <BarsIcon />
        </PFButton>
      </PFToolbarItem>
      <PFToolbarItem className="ascender-expand-collapse__toolbar-item">
        <PFButton
          ouiaId="toolbar-expand-button"
          variant="plain"
          aria-label={t`Expand`}
          onClick={onExpand}
          className={buttonClass(!isCompact)}
        >
          <EqualsIcon />
        </PFButton>
      </PFToolbarItem>
    </>
  );
}

export default ExpandCollapse;
