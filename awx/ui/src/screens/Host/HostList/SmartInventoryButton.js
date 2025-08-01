import React from 'react';
import { bool, func } from 'prop-types';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { useKebabifiedMenu } from 'contexts/Kebabified';

function SmartInventoryButton({
  onClick,
  isDisabled,
  hasInvalidKeys,
  hasAnsibleFactsKeys,
}) {
  const { i18n } = useLingui();
  const { isKebabified } = useKebabifiedMenu();

  const renderTooltipContent = () => {
    if (hasInvalidKeys) {
      return i18n._(
        msg`Some search modifiers like not__ and __search are not supported in Smart Inventory host filters.  Remove these to create a new Smart Inventory with this filter.`
      );
    }
    if (hasAnsibleFactsKeys) {
      return i18n._(
        msg`To create a smart inventory using ansible facts, go to the smart inventory screen.`
      );
    }
    if (isDisabled) {
      return i18n._(
        msg`Enter at least one search filter to create a new Smart Inventory`
      );
    }

    return i18n._(msg`Create a new Smart Inventory with the applied filter`);
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
          {i18n._(msg`Smart Inventory`)}
        </DropdownItem>
      );
    }

    return (
      <Button
        ouiaId="smart-inventory-button"
        onClick={onClick}
        aria-label={i18n._(msg`Smart Inventory`)}
        variant="secondary"
        isDisabled={isDisabled}
      >
        {i18n._(msg`Smart Inventory`)}
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
SmartInventoryButton.propTypes = {
  hasInvalidKeys: bool,
  isDisabled: bool,
  onClick: func.isRequired,
  hasAnsibleFactsKeys: bool,
};

SmartInventoryButton.defaultProps = {
  hasInvalidKeys: false,
  isDisabled: false,
  hasAnsibleFactsKeys: false,
};

export default SmartInventoryButton;
