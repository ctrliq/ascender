import React, { useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from '@patternfly/react-core';
import { RocketIcon } from '@patternfly/react-icons';

import WorkflowRelaunchVariablesModal from './WorkflowRelaunchVariablesModal';

export interface WorkflowReLaunchDropDownProps {
  isPrimary?: boolean;
  /** Which of the workflow's nodes to run again: all, failed, or the first. */
  handleRelaunch: (params?: {
    nodes?: string;
    extra_vars?: Record<string, unknown>;
  }) => void;
  isLaunching?: boolean;
  id?: string;
  ouiaId?: string;
  status?: unknown;
  /**
   * Whether the workflow job template lets a relaunch be given variables that
   * overwrite the ones the run used. Adds a second from-failed entry that asks
   * for them first.
   */
  canOverwriteVars?: boolean;
  /** The job being relaunched, which that entry reads its variables from. */
  jobId?: number;
  [key: string]: unknown;
}

function WorkflowReLaunchDropDown({
  isPrimary = false,
  handleRelaunch,
  isLaunching,
  id = 'relaunch-workflow',
  ouiaId,
  status,
  canOverwriteVars = false,
  jobId,
}: WorkflowReLaunchDropDownProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [isAskingForVars, setIsAskingForVars] = useState(false);

  // The "from failed" option re-runs every node that did not succeed and carries
  // the successful ones forward; word it to match how the workflow ended.
  const isCanceled = status === 'canceled';
  const failedNodeLabel = isCanceled ? t`Canceled node` : t`Failed node`;
  const failedNodeAriaLabel = isCanceled
    ? t`Relaunch from canceled node`
    : t`Relaunch from failed node`;
  const newVarsNodeLabel = isCanceled
    ? t`Canceled node, new variables`
    : t`Failed node, new variables`;
  const newVarsAriaLabel = isCanceled
    ? t`Relaunch from canceled node with new variables`
    : t`Relaunch from failed node with new variables`;

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
      {canOverwriteVars && jobId !== undefined && (
        <DropdownItem
          ouiaId={`${ouiaId}-failed-new-vars`}
          key="relaunch_failed_new_vars"
          aria-label={newVarsAriaLabel}
          onClick={() => {
            setIsAskingForVars(true);
          }}
          isDisabled={isLaunching}
        >
          {newVarsNodeLabel}
        </DropdownItem>
      )}
    </DropdownList>
  );

  const variablesModal = isAskingForVars && jobId !== undefined && (
    <WorkflowRelaunchVariablesModal
      jobId={jobId}
      isCanceled={isCanceled}
      onCancel={() => setIsAskingForVars(false)}
      onConfirm={(extraVars) => {
        setIsAskingForVars(false);
        handleRelaunch({ nodes: 'failed', extra_vars: extraVars });
      }}
    />
  );

  if (isPrimary) {
    return (
      <>
        {variablesModal}
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
      </>
    );
  }

  return (
    <>
      {variablesModal}
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
    </>
  );
}

export default WorkflowReLaunchDropDown;
