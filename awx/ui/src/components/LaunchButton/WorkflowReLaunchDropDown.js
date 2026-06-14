import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Dropdown,
  DropdownToggle,
  DropdownItem,
  DropdownPosition,
  DropdownSeparator,
  DropdownDirection,
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

  const onToggle = () => {
    setIsOpen((prev) => !prev);
  };

  // The "from failed" option re-runs every node that did not succeed and carries
  // the successful ones forward; word it to match how the workflow ended.
  const isCanceled = status === 'canceled';
  const failedNodeLabel = isCanceled ? t`Canceled node` : t`Failed node`;
  const failedNodeAriaLabel = isCanceled
    ? t`Relaunch from canceled node`
    : t`Relaunch from failed node`;

  const dropdownItems = [
    <DropdownItem
      ouiaId={`${ouiaId}-relaunch-from`}
      aria-label={t`Relaunch from:`}
      key="relaunch_from"
      component="div"
      isPlainText
    >
      {t`Relaunch from:`}
    </DropdownItem>,
    <DropdownSeparator key="separator" />,
    <DropdownItem
      ouiaId={`${ouiaId}-first`}
      key="relaunch_first"
      aria-label={t`Relaunch from first node`}
      component="button"
      onClick={() => {
        handleRelaunch({});
      }}
      isDisabled={isLaunching}
    >
      {t`First node`}
    </DropdownItem>,
    <DropdownItem
      ouiaId={`${ouiaId}-failed`}
      key="relaunch_failed"
      aria-label={failedNodeAriaLabel}
      component="button"
      onClick={() => {
        handleRelaunch({ nodes: 'failed' });
      }}
      isDisabled={isLaunching}
    >
      {failedNodeLabel}
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
        toggle={(
          <DropdownToggle
            toggleIndicator={null}
            onToggle={onToggle}
            aria-label={t`relaunch workflow`}
            id={id}
            isPrimary
            ouiaId="relaunch-workflow-toggle"
          >
            {t`Relaunch`}
          </DropdownToggle>
        )}
      />
    );
  }

  return (
    <Dropdown
      ouiaId={ouiaId}
      isPlain
      position={DropdownPosition.right}
      // Render the menu in a popper on document.body so it flips above the
      // toggle when there is no room below (e.g. the last rows of the jobs
      // list) instead of extending the page, and is not clipped by the table.
      menuAppendTo={() => document.body}
      isOpen={isOpen}
      dropdownItems={dropdownItems}
      toggle={(
        <DropdownToggle
          toggleIndicator={null}
          onToggle={onToggle}
          aria-label={t`relaunch workflow`}
          id={id}
          ouiaId="relaunch-workflow-toggle"
        >
          <RocketIcon />
        </DropdownToggle>
      )}
    />
  );
}

export default WorkflowReLaunchDropDown;
