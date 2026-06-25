import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
	Divider,
	Dropdown,
	DropdownItem,
	DropdownList,
	MenuToggle
} from '@patternfly/react-core';
import { RocketIcon } from '@patternfly/react-icons';

function ReLaunchDropDown({
  isPrimary = false,
  handleRelaunch,
  isLaunching,
  id = 'relaunch-job',
  ouiaId,
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const dropdownItems = (
    <DropdownList>
      <DropdownItem
        ouiaId={`${ouiaId}-on`}
        aria-label={t`Relaunch on`}
        key="relaunch_on"
        isAriaDisabled
      >
        {t`Relaunch on`}
      </DropdownItem>
      <Divider key="separator" />
      <DropdownItem
        ouiaId={`${ouiaId}-all`}
        key="relaunch_all"
        aria-label={t`Relaunch all hosts`}
        onClick={() => {
          handleRelaunch({ hosts: 'all' });
        }}
        isDisabled={isLaunching}
      >
        {t`All`}
      </DropdownItem>
      <DropdownItem
        ouiaId={`${ouiaId}-failed`}
        key="relaunch_failed"
        aria-label={t`Relaunch failed hosts`}
        onClick={() => {
          handleRelaunch({ hosts: 'failed' });
        }}
        isDisabled={isLaunching}
      >
        {t`Failed hosts`}
      </DropdownItem>
    </DropdownList>
  );

  if (isPrimary) {
    return (
      <Dropdown
        ouiaId={ouiaId}
        popperProps={{ position: 'left', direction: 'up' }}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            onClick={() => setIsOpen(!isOpen)}
            isExpanded={isOpen}
            aria-label={t`relaunch jobs`}
            id={id}
            variant="primary"
            ouiaId="relaunch-job-toggle"
          >
            {t`Relaunch`}
          </MenuToggle>
        )}
      >
        {dropdownItems}
      </Dropdown>
    );
  }

  return (
    <Dropdown
      ouiaId={ouiaId}
      popperProps={{ position: 'right', appendTo: () => document.body }}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
          aria-label={t`relaunch jobs`}
          id={id}
          ouiaId="relaunch-job-toggle"
        >
          <RocketIcon />
        </MenuToggle>
      )}
    >
      {dropdownItems}
    </Dropdown>
  );
}

export default ReLaunchDropDown;
