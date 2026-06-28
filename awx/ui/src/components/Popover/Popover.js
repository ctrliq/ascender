import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Popover as PFPopover } from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import styled from 'styled-components';

const PopoverButton = styled.button`
  padding: var(--pf-v6-global--spacer--xs);
  margin: calc(-1 * var(--pf-v6-global--spacer--xs));
  font-size: var(--pf-v6-global--FontSize--sm);
  line-height: 1;
  vertical-align: middle;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--pf-v6-global--Color--200);
  &:hover {
    color: var(--pf-v6-global--Color--100);
  }
`;

function Popover({
  ariaLabel = null,
  content = null,
  header = null,
  id = '',
  maxWidth = '',
  ouiaId,
  ...rest
}) {
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
      <PopoverButton
        aria-label={ariaLabel ?? t`More information`}
        aria-haspopup="true"
        className="pf-v6-c-form__group-label-help"
        onClick={(e) => e.preventDefault()}
        type="button"
        {...(ouiaId ? { 'data-ouia-component-id': ouiaId } : {})}
      >
        <HelpIcon />
      </PopoverButton>
    </PFPopover>
  );
}

export default Popover;
