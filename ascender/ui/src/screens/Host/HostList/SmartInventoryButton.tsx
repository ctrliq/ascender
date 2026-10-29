import React from 'react';
import { Button, DropdownItem } from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';

import { useKebabifiedMenu } from 'contexts/Kebabified';
import Tooltip from 'components/Tooltip';

export interface SmartInventoryButtonProps {
  onClick: (event?: React.MouseEvent) => void;
  isDisabled?: boolean;
  hasInvalidKeys?: boolean;
  hasAnsibleFactsKeys?: boolean;
  [key: string]: unknown;
}

function SmartInventoryButton({
  onClick,
  isDisabled = false,
  hasInvalidKeys = false,
  hasAnsibleFactsKeys = false,
}: SmartInventoryButtonProps) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  const renderTooltipContent = () => {
    if (hasInvalidKeys) {
      return t`Some search modifiers like not__ and __search are not supported in Smart Inventory host filters. Remove these to add a Smart Inventory with this filter.`;
    }
    if (hasAnsibleFactsKeys) {
      return t`To add a Smart Inventory using Ansible facts, go to the Smart Inventory screen.`;
    }
    if (isDisabled) {
      return t`Enter at least one search filter to add a Smart Inventory.`;
    }

    return t`Add Smart Inventory From This Filter`;
  };

  const renderContent = () => {
    if (isKebabified) {
      return (
        <DropdownItem
          key="add"
          isDisabled={isDisabled}
          component="button"
          onClick={onClick}
          ouiaId="smart-inventory-dropdown-item"
        >
          {t`Add Smart Inventory`}
        </DropdownItem>
      );
    }

    return (
      <Button
        ouiaId="smart-inventory-button"
        onClick={onClick}
        aria-label={t`Add Smart Inventory`}
        variant="secondary"
        isDisabled={isDisabled}
      >
        {t`Add Smart Inventory`}
      </Button>
    );
  };

  return (
    <Tooltip
      key="smartInventory"
      content={renderTooltipContent()}
      position="top"
    >
      <div>{renderContent()}</div>
    </Tooltip>
  );
}

export default SmartInventoryButton;
