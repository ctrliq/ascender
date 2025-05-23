import React, { useContext } from 'react';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import PropTypes from 'prop-types';
import { Button, DropdownItem, Tooltip } from '@patternfly/react-core';
import { KebabifiedContext } from 'contexts/Kebabified';
import { WorkflowApproval } from 'types';

function cannotApprove(item) {
  return !item.can_approve_or_deny;
}

function WorkflowApprovalListApproveButton({ onApprove, selectedItems }) {
  const { i18n } = useLingui();
  const { isKebabified } = useContext(KebabifiedContext);

  const renderTooltip = () => {
    if (selectedItems.length === 0) {
      return i18n._(msg`Select a row to approve`);
    }

    const itemsUnableToApprove = selectedItems
      .filter(cannotApprove)
      .map((item) => item.name)
      .join(', ');

    if (selectedItems.some(cannotApprove)) {
      return i18n._(msg`You are unable to act on the following workflow approvals: ${itemsUnableToApprove}`);
    }

    return i18n._(msg`Approve`);
  };

  const isDisabled =
    selectedItems.length === 0 || selectedItems.some(cannotApprove);

  return (
    /* eslint-disable-next-line react/jsx-no-useless-fragment */
    <>
      {isKebabified ? (
        <DropdownItem
          key="approve"
          isDisabled={isDisabled}
          component="button"
          onClick={onApprove}
        >
          {i18n._(msg`Approve`)}
        </DropdownItem>
      ) : (
        <Tooltip content={renderTooltip()} position="top">
          <div>
            <Button
              ouiaId="workflow-approval-approve-button"
              isDisabled={isDisabled}
              aria-label={i18n._(msg`Approve`)}
              variant="primary"
              onClick={onApprove}
            >
              {i18n._(msg`Approve`)}
            </Button>
          </div>
        </Tooltip>
      )}
    </>
  );
}

WorkflowApprovalListApproveButton.propTypes = {
  onApprove: PropTypes.func.isRequired,
  selectedItems: PropTypes.arrayOf(WorkflowApproval),
};

WorkflowApprovalListApproveButton.defaultProps = {
  selectedItems: [],
};

export default WorkflowApprovalListApproveButton;
