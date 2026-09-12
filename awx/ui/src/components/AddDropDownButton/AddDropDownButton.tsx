import React, { useState } from 'react';
import { Dropdown, DropdownList } from '@patternfly/react-core';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import { ToolbarAddButton } from '../PaginatedTable';

export interface AddDropDownButtonProps {
  dropdownItems: React.ReactNode;
  ouiaId?: string;
  [key: string]: unknown;
}

function AddDropDownButton({ dropdownItems, ouiaId }: AddDropDownButtonProps) {
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
          showToggleIndicator
          isExpanded={isOpen}
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
