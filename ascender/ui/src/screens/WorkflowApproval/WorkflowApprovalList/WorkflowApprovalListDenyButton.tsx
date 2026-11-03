import type { WorkflowApproval } from 'types/api';
import React, { useContext } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem } from '@patternfly/react-core';

import { KebabifiedContext } from 'contexts/Kebabified';
import Tooltip from 'components/Tooltip';
import { isWorkflowDeleted } from '../shared/WorkflowApprovalUtils';

function cannotDeny(item: WorkflowApproval) {
  // The api still says an orphaned approval can be voted on, since it stays
  // pending when its workflow is deleted. There is nothing left to resume, so
  // the toolbar treats it the way the row does.
  return !item.can_approve_or_deny || isWorkflowDeleted(item);
}

export interface WorkflowApprovalListDenyButtonProps {
  onDeny: () => void;
  selectedItems?: WorkflowApproval[];
  [key: string]: unknown;
}

function WorkflowApprovalListDenyButton({
  onDeny,
  selectedItems = [],
}: WorkflowApprovalListDenyButtonProps) {
  const { t } = useLingui();
  const { isKebabified } = useContext(KebabifiedContext);

  const renderTooltip = () => {
    if (selectedItems.length === 0) {
      return t`Select a row to deny`;
    }

    const itemsUnableToDeny = selectedItems
      .filter(cannotDeny)
      .map((item) => item.name)
      .join(', ');

    if (selectedItems.some(cannotDeny)) {
      return t`You are unable to act on the following workflow approvals: ${itemsUnableToDeny}`;
    }

    return t`Deny`;
  };

  const isDisabled =
    selectedItems.length === 0 || selectedItems.some(cannotDeny);

  return (
    <>
      {isKebabified ? (
        <DropdownItem
          key="deny"
          isDisabled={isDisabled}
          component="button"
          onClick={onDeny}
        >
          {t`Deny`}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              ouiaId="workflow-approval-deny-button"
              isDisabled={isDisabled}
              aria-label={t`Deny`}
              variant="danger"
              onClick={onDeny}
            >
              {t`Deny`}
            </Button>
          </div>
        </Tooltip>
      )}
    </>
  );
}

export default WorkflowApprovalListDenyButton;
