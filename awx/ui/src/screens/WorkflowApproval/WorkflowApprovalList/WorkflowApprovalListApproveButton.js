import React, { useContext } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import { KebabifiedContext } from 'contexts/Kebabified';

function cannotApprove(item) {
  return !item.can_approve_or_deny;
}

function WorkflowApprovalListApproveButton({ onApprove, selectedItems = [] }) {
  const { t } = useLingui();
  const { isKebabified } = useContext(KebabifiedContext);

  const renderTooltip = () => {
    if (selectedItems.length === 0) {
      return t`Select a row to approve`;
    }

    const itemsUnableToApprove = selectedItems
      .filter(cannotApprove)
      .map((item) => item.name)
      .join(', ');

    if (selectedItems.some(cannotApprove)) {
      return t`You are unable to act on the following workflow approvals: ${itemsUnableToApprove}`;
    }

    return t`Approve`;
  };

  const isDisabled =
    selectedItems.length === 0 || selectedItems.some(cannotApprove);

  return (

    <>
      {isKebabified ? (
        <DropdownItem
          key="approve"
          isDisabled={isDisabled}
          component="button"
          onClick={onApprove}
        >
          {t`Approve`}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              ouiaId="workflow-approval-approve-button"
              isDisabled={isDisabled}
              aria-label={t`Approve`}
              variant="primary"
              onClick={onApprove}
            >
              {t`Approve`}
            </Button>
          </div>
        </Tooltip>
      )}
    </>
  );
}

export default WorkflowApprovalListApproveButton;
