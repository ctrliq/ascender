import React from 'react';
import { Link } from 'react-router';
import { Button, DropdownItem, MenuToggle } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import Tooltip from '../Tooltip';

export interface ToolbarAddButtonProps {
  /** Where the button leads. Either this or onClick, never neither. */
  linkTo?: string;
  onClick?: (event: React.MouseEvent) => void;
  isDisabled?: boolean;
  isExpanded?: boolean;
  defaultLabel?: string;
  /**
   * What the tooltip says, where the button's own word is not enough: a
   * toolbar of one-word buttons says Add, and the tooltip says what of.
   */
  tooltip?: React.ReactNode;
  /** Renders a menu toggle rather than a button, for an add with a menu. */
  showToggleIndicator?: boolean;
  ouiaId?: string;
  /** The toggle's own element, which the menu it opens is anchored to. */
  ref?: React.Ref<HTMLButtonElement>;
}

function ToolbarAddButton({
  linkTo,
  onClick,
  isDisabled,
  isExpanded,
  defaultLabel,
  tooltip,
  showToggleIndicator,
  ouiaId,
  ref,
}: ToolbarAddButtonProps) {
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
      <Tooltip content={tooltip ?? defaultLabel ?? t`Add`} position="top">
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
      <Tooltip content={tooltip ?? defaultLabel ?? t`Add`} position="top">
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
    <Tooltip content={tooltip ?? defaultLabel ?? t`Add`} position="top">
      <Button ouiaId={ouiaId} onClick={onClick} isDisabled={isDisabled}>
        {defaultLabel || t`Add`}
      </Button>
    </Tooltip>
  );
}
export default ToolbarAddButton;
