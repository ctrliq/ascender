
import React, { useState, useRef, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
	Dropdown,
	DropdownPosition
} from '@patternfly/react-core/deprecated';
import { useKebabifiedMenu } from 'contexts/Kebabified';
import { ToolbarAddButton } from '../PaginatedTable';

function AddDropDownButton({ dropdownItems, ouiaId }) {
  const { t } = useLingui();
  const { isKebabified } = useKebabifiedMenu();
  const [isOpen, setIsOpen] = useState(false);
  const element = useRef(null);

  useEffect(() => {
    const toggle = (e) => {
      if (!isKebabified && (!element || !element.current?.contains(e.target))) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', toggle, false);
    return () => {
      document.removeEventListener('click', toggle);
    };
  }, [isKebabified]);

  if (isKebabified) {
    return <>{dropdownItems}</>;
  }

  return (
    <div ref={element} key="add">
      <Dropdown
        isPlain
        isOpen={isOpen}
        position={DropdownPosition.right}
        toggle={
          <ToolbarAddButton
            ouiaId={ouiaId}
            aria-label={t`Add`}
            showToggleIndicator
            onClick={() => setIsOpen(!isOpen)}
          />
        }
        dropdownItems={dropdownItems}
        ouiaId="add-dropdown"
      />
    </div>
  );
}

export { AddDropDownButton as _AddDropDownButton };
export default AddDropDownButton;
