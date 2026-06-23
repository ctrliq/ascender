import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Popover as PFPopover } from '@patternfly/react-core';
import { HelpIcon } from '@patternfly/react-icons';
import styled from 'styled-components';

const PopoverButton = styled.button`
  padding: var(--pf-v5-global--spacer--xs);
  margin: -(var(--pf-v5-global--spacer--xs));
  font-size: var(--pf-v5-global--FontSize--sm);
  --pf-v5-c-form__group-label-help--Color: var(--pf-v5-global--Color--200);
  --pf-v5-c-form__group-label-help--hover--Color: var(--pf-v5-global--Color--100);
`;

function Popover({
  ariaLabel = null,
  content = null,
  header = null,
  id = '',
  maxWidth = '',
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
        className="pf-v5-c-form__group-label-help"
        onClick={(e) => e.preventDefault()}
        type="button"
      >
        <HelpIcon />
      </PopoverButton>
    </PFPopover>
  );
}

export default Popover;
