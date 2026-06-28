import React, { forwardRef } from 'react';
import { Link } from 'react-router';
import {
	Button,
	DropdownItem,
	MenuToggle,
	Tooltip
} from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { useKebabifiedMenu } from 'contexts/Kebabified';

const ToolbarAddButton = forwardRef(({
  linkTo = null,
  onClick = null,
  isDisabled,
  isExpanded,
  defaultLabel,
  showToggleIndicator,
  ouiaId,
}, ref) => {
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
  if (showToggleIndicator) {
    return (
      <Tooltip content={defaultLabel || t`Add`} position="top">
        <MenuToggle
          ref={ref}
          ouiaId={ouiaId}
          onClick={onClick}
          isDisabled={isDisabled}
          isExpanded={isExpanded}
          variant="primary"
        >
          {defaultLabel || t`Add`}
        </MenuToggle>
      </Tooltip>
    );
  }
  if (linkTo) {
    return (
      <Tooltip content={defaultLabel || t`Add`} position="top">
        <Button
          ouiaId={ouiaId}
          component={Link}
          to={linkTo}
          isDisabled={isDisabled}
        >
          {defaultLabel || t`Add`}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={defaultLabel || t`Add`} position="top">
      <Button ouiaId={ouiaId} onClick={onClick} isDisabled={isDisabled}>
        {defaultLabel || t`Add`}
      </Button>
    </Tooltip>
  );
});
export default ToolbarAddButton;
