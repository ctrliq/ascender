import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Popover as PFPopover } from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import './Popover.css';

export interface PopoverProps {
  ariaLabel?: string;
  content?: React.ReactNode;
  header?: React.ReactNode;
  id?: string;
  /** A css length, capping how wide the popover grows. */
  maxWidth?: string;
  ouiaId?: string;
  [key: string]: unknown;
}

function Popover({
  ariaLabel,
  content,
  header,
  id = '',
  maxWidth = '',
  ouiaId,
  ...rest
}: PopoverProps) {
  const { t } = useLingui();
  if (!content) {
    return null;
  }
  return (
    <PFPopover
      bodyContent={content}
      headerContent={header}
      hideOnOutsideClick
      id={id}
      data-cy={id}
      maxWidth={maxWidth}
      {...rest}
    >
      <button
        aria-label={ariaLabel ?? t`More information`}
        aria-haspopup="true"
        className="ascender-popover__button pf-v6-c-form__group-label-help"
        onClick={(e) => e.preventDefault()}
        type="button"
        {...(ouiaId ? { 'data-ouia-component-id': ouiaId } : {})}
      >
        <HelpIcon />
      </button>
    </PFPopover>
  );
}

export default Popover;
