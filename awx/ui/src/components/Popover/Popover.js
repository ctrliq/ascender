import React from 'react';
import { node, string } from 'prop-types';
import { useLingui } from '@lingui/react/macro';
import { Popover as PFPopover } from '@patternfly/react-core';
import { LucideIconCircleHelp } from '@ctrliq/quantic-react';
import styled from 'styled-components';

const PopoverButton = styled.button`
  padding: var(--pf-global--spacer--xs);
  margin: -(var(--pf-global--spacer--xs));
  font-size: var(--pf-global--FontSize--sm);
  --pf-c-form__group-label-help--Color: var(--pf-global--Color--200);
  --pf-c-form__group-label-help--hover--Color: var(--pf-global--Color--100);
`;

function Popover({ ariaLabel, content, header, id, maxWidth, ...rest }) {
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
        className="pf-c-form__group-label-help"
        onClick={(e) => e.preventDefault()}
        type="button"
      >
        <LucideIconCircleHelp data-original-icon="HelpIcon" size={16} />
      </PopoverButton>
    </PFPopover>
  );
}

Popover.propTypes = {
  ariaLabel: string,
  content: node,
  header: node,
  id: string,
  maxWidth: string,
};
Popover.defaultProps = {
  ariaLabel: null,
  content: null,
  header: null,
  id: '',
  maxWidth: '',
};

export default Popover;
