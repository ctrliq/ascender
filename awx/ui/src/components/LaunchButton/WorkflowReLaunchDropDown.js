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

function WorkflowReLaunchDropDown({
  isPrimary = false,
  handleRelaunch,
  isLaunching,
  id = 'relaunch-workflow',
  ouiaId,
  status,
}) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  // The "from failed" option re-runs every node that did not succeed and carries
  // the successful ones forward; word it to match how the workflow ended.
  const isCanceled = status === 'canceled';
  const failedNodeLabel = isCanceled ? t`Canceled node` : t`Failed node`;
  const failedNodeAriaLabel = isCanceled
    ? t`Relaunch from canceled node`
    : t`Relaunch from failed node`;

  const dropdownItems = (
    <DropdownList>
      <DropdownItem
        ouiaId={`${ouiaId}-relaunch-from`}
        aria-label={t`Relaunch from:`}
        key="relaunch_from"
        isAriaDisabled
      >
        {t`Relaunch from:`}
      </DropdownItem>
      <Divider key="separator" />
      <DropdownItem
        ouiaId={`${ouiaId}-first`}
        key="relaunch_first"
        aria-label={t`Relaunch from first node`}
        onClick={() => {
          handleRelaunch({});
        }}
        isDisabled={isLaunching}
      >
        {t`First node`}
      </DropdownItem>
      <DropdownItem
        ouiaId={`${ouiaId}-failed`}
        key="relaunch_failed"
        aria-label={failedNodeAriaLabel}
        onClick={() => {
          handleRelaunch({ nodes: 'failed' });
        }}
        isDisabled={isLaunching}
      >
        {failedNodeLabel}
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
            aria-label={t`relaunch workflow`}
            id={id}
            variant="primary"
            ouiaId="relaunch-workflow-toggle"
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
          aria-label={t`relaunch workflow`}
          id={id}
          ouiaId="relaunch-workflow-toggle"
        >
          <RocketIcon />
        </MenuToggle>
      )}
    >
      {dropdownItems}
    </Dropdown>
  );
}

export default WorkflowReLaunchDropDown;
