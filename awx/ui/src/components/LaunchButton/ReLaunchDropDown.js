import React, { useState } from 'react';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Dropdown,
  DropdownToggle,
  DropdownItem,
  DropdownPosition,
  DropdownSeparator,
  DropdownDirection,
} from '@patternfly/react-core';
import { RocketIcon } from '@patternfly/react-icons';

function ReLaunchDropDown({
  isPrimary = false,
  handleRelaunch,
  isLaunching,
  id = 'relaunch-job',
  ouiaId,
}) {
  const { i18n } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  const onToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const dropdownItems = [
    <DropdownItem
      ouiaId={`${ouiaId}-on`}
      aria-label={i18n._(t`Relaunch on`)}
      key="relaunch_on"
      component="div"
      isPlainText
    >
      {i18n._(t`Relaunch on`)}
    </DropdownItem>,
    <DropdownSeparator key="separator" />,
    <DropdownItem
      ouiaId={`${ouiaId}-all`}
      key="relaunch_all"
      aria-label={i18n._(t`Relaunch all hosts`)}
      component="button"
      onClick={() => {
        handleRelaunch({ hosts: 'all' });
      }}
      isDisabled={isLaunching}
    >
      {i18n._(t`All`)}
    </DropdownItem>,

    <DropdownItem
      ouiaId={`${ouiaId}-failed`}
      key="relaunch_failed"
      aria-label={i18n._(t`Relaunch failed hosts`)}
      component="button"
      onClick={() => {
        handleRelaunch({ hosts: 'failed' });
      }}
      isDisabled={isLaunching}
    >
      {i18n._(t`Failed hosts`)}
    </DropdownItem>,
  ];

  if (isPrimary) {
    return (
      <Dropdown
        ouiaId={ouiaId}
        position={DropdownPosition.left}
        direction={DropdownDirection.up}
        isOpen={isOpen}
        dropdownItems={dropdownItems}
        toggle={
          <DropdownToggle
            toggleIndicator={null}
            onToggle={onToggle}
            aria-label={i18n._(t`relaunch jobs`)}
            id={id}
            isPrimary
            ouiaId="relaunch-job-toggle"
          >
            {i18n._(t`Relaunch`)}
          </DropdownToggle>
        }
      />
    );
  }

  return (
    <Dropdown
      ouiaId={ouiaId}
      isPlain
      position={DropdownPosition.right}
      isOpen={isOpen}
      dropdownItems={dropdownItems}
      toggle={
        <DropdownToggle
          toggleIndicator={null}
          onToggle={onToggle}
          aria-label={i18n._(t`relaunch jobs`)}
          id={id}
          ouiaId="relaunch-job-toggle"
        >
          <RocketIcon />
        </DropdownToggle>
      }
    />
  );
}

export default ReLaunchDropDown;
