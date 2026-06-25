import React from 'react';
import {
	Button,
	Tooltip,
	DropdownItem,
} from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';

import { useKebabifiedMenu } from 'contexts/Kebabified';

function SmartInventoryButton({
  onClick,
  isDisabled = false,
  hasInvalidKeys = false,
  hasAnsibleFactsKeys = false,
}) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  const renderTooltipContent = () => {
    if (hasInvalidKeys) {
      return t`Some search modifiers like not__ and __search are not supported in Smart Inventory host filters.  Remove these to create a new Smart Inventory with this filter.`;
    }
    if (hasAnsibleFactsKeys) {
      return t`To create a smart inventory using ansible facts, go to the smart inventory screen.`;
    }
    if (isDisabled) {
      return t`Enter at least one search filter to create a new Smart Inventory`;
    }

    return t`Create a new Smart Inventory with the applied filter`;
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
          {t`Smart Inventory`}
        </DropdownItem>
      );
    }

    return (
      <Button
        ouiaId="smart-inventory-button"
        onClick={onClick}
        aria-label={t`Smart Inventory`}
        variant="secondary"
        isDisabled={isDisabled}
      >
        {t`Smart Inventory`}
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
