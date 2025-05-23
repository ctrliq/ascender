import React from 'react';
import { string, func } from 'prop-types';
import { Link } from 'react-router-dom';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import CaretDownIcon from '@patternfly/react-icons/dist/js/icons/caret-down-icon';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useKebabifiedMenu } from 'contexts/Kebabified';

function ToolbarAddButton({
  linkTo,
  onClick,
  isDisabled,
  defaultLabel,
  showToggleIndicator,
  ouiaId,
}) {
  const { i18n } = useLingui();
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
        {defaultLabel || i18n._(msg`Add`)}
      </DropdownItem>
    );
  }
  if (linkTo) {
    return (
      <Tooltip content={defaultLabel || i18n._(msg`Add`)} position="top">
        <Button
          ouiaId={ouiaId}
          component={Link}
          to={linkTo}
          isDisabled={isDisabled}
        >
          {defaultLabel || i18n._(msg`Add`)}
          {showToggleIndicator && <CaretDownIcon />}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={defaultLabel || i18n._(msg`Add`)} position="top">
      <Button
        ouiaId={ouiaId}
        onClick={onClick}
        isDisabled={isDisabled}
      >
        {defaultLabel || i18n._(msg`Add`)}
        {showToggleIndicator && <CaretDownIcon />}
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
