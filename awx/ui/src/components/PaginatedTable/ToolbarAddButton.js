import React from 'react';
import { string, func } from 'prop-types';
import { Link } from 'react-router-dom';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import { LucideIconChevronDown } from '@ctrliq/quantic-react';
import { useLingui } from '@lingui/react/macro';
import { useKebabifiedMenu } from 'contexts/Kebabified';

function ToolbarAddButton({
  linkTo,
  onClick,
  isDisabled,
  defaultLabel,
  showToggleIndicator,
  ouiaId,
}) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  if (!linkTo && !onClick) {
    throw new Error(
      'ToolbarAddButton requires either `linkTo` or `onClick` prop'
    );
  }
  if (isKebabified) {
    return (
      <DropdownItem
        ouiaId={ouiaId}
        key="add"
        isDisabled={isDisabled}
        component={linkTo ? Link : 'button'}
        to={linkTo}
        onClick={!onClick ? undefined : onClick}
      >
        {defaultLabel || t`Add`}
      </DropdownItem>
    );
  }
  if (linkTo) {
    return (
      <Tooltip content={defaultLabel || t`Add`} position="top" open>
        <Button
          ouiaId={ouiaId}
          component={Link}
          to={linkTo}
          isDisabled={isDisabled}
        >
          {defaultLabel || t`Add`}
          {showToggleIndicator && (
            <LucideIconChevronDown
              data-original-icon="CaretDownIcon"
              size={16}
            />
          )}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={defaultLabel || t`Add`} position="top">
      <Button ouiaId={ouiaId} onClick={onClick} isDisabled={isDisabled}>
        {defaultLabel || t`Add`}
        {showToggleIndicator && (
          <LucideIconChevronDown data-original-icon="CaretDownIcon" size={16} />
        )}
      </Button>
    </Tooltip>
  );
}
ToolbarAddButton.propTypes = {
  linkTo: string,
  onClick: func,
};
ToolbarAddButton.defaultProps = {
  linkTo: null,
  onClick: null,
};

export default ToolbarAddButton;
