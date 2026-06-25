
import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
	Dropdown,
	DropdownList
} from '@patternfly/react-core';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import { ToolbarAddButton } from '../PaginatedTable';

function AddDropDownButton({ dropdownItems, ouiaId }) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();
  const [isOpen, setIsOpen] = useState(false);

  if (isKebabified) {
    return <>{dropdownItems}</>;
  }

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef) => (
        <ToolbarAddButton
          ref={toggleRef}
          ouiaId={ouiaId}
          aria-label={t`Add`}
          showToggleIndicator
          onClick={() => setIsOpen(!isOpen)}
        />
      )}
      ouiaId="add-dropdown"
    >
      <DropdownList>{dropdownItems}</DropdownList>
    </Dropdown>
  );
}

export { AddDropDownButton as _AddDropDownButton };
export default AddDropDownButton;
