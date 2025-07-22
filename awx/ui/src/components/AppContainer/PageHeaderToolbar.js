//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import {
  Dropdown,
  DropdownItem,
  DropdownToggle,
  DropdownPosition,
  NotificationBadge,
  NotificationBadgeVariant,
  PageHeaderTools,
  PageHeaderToolsGroup,
  PageHeaderToolsItem,
  Tooltip,
} from '@patternfly/react-core';
import { QuestionCircleIcon, UserIcon } from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest from 'hooks/useRequest';
/* import getDocsBaseUrl from 'util/getDocsBaseUrl'; */
/* import { useConfig } from 'contexts/Config'; */
import useWsPendingApprovalCount from './useWsPendingApprovalCount';

const PendingWorkflowApprovals = styled.div`
  display: flex;
  align-items: center;
  padding: 10px;
  margin-right: 10px;
`;

function PageHeaderToolbar({
  isAboutDisabled,
  onAboutClick,
  onLogoutClick,
  loggedInUser,
}) {
  const { i18n } = useLingui();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  /*   const config = useConfig(); */

  const { request: fetchPendingApprovalCount, result: pendingApprovals } =
    useRequest(
      useCallback(async () => {
        const {
          data: { count },
        } = await WorkflowApprovalsAPI.read({
          status: 'pending',
          page_size: 1,
        });
        return count;
      }, []),
      0
    );

  const pendingApprovalsCount = useWsPendingApprovalCount(
    pendingApprovals,
    fetchPendingApprovalCount
  );

  useEffect(() => {
    fetchPendingApprovalCount();
  }, [fetchPendingApprovalCount]);

  const handleHelpSelect = () => {
    setIsHelpOpen(!isHelpOpen);
  };

  const handleUserSelect = () => {
    setIsUserOpen(!isUserOpen);
  };
  return (
    <PageHeaderTools>
      <PageHeaderToolsGroup>
        <Tooltip
          position="bottom"
          content={i18n._(msg`Pending Workflow Approvals`)}
        >
          <PageHeaderToolsItem>
            <Link to="/workflow_approvals?workflow_approvals.status=pending">
              <PendingWorkflowApprovals>
                <NotificationBadge
                  id="toolbar-workflow-approval-badge"
                  count={pendingApprovalsCount}
                  variant={
                    pendingApprovalsCount === 0
                      ? NotificationBadgeVariant.read
                      : NotificationBadgeVariant.unread
                  }
                />
              </PendingWorkflowApprovals>
            </Link>
          </PageHeaderToolsItem>
        </Tooltip>
        <PageHeaderToolsItem>
          <Dropdown
            isPlain
            isOpen={isHelpOpen}
            position={DropdownPosition.right}
            onSelect={handleHelpSelect}
            ouiaId="toolbar-info-dropdown"
            toggle={
              <DropdownToggle
                onToggle={setIsHelpOpen}
                aria-label={i18n._(msg`Info`)}
                ouiaId="toolbar-info-dropdown-toggle"
              >
                <QuestionCircleIcon />
              </DropdownToggle>
            }
            dropdownItems={[
              /*
              <DropdownItem
                key="help"
                target="_blank"
                href={`${getDocsBaseUrl(config)}/html/userguide/index.html`}
                ouiaId="help-dropdown-item"
                rel="noopener noreferrer"
              >
                {i18n._(msg`Help`)}
              </DropdownItem>,
*/
              <DropdownItem
                key="about"
                component="button"
                isDisabled={isAboutDisabled}
                onClick={onAboutClick}
                ouiaId="about-dropdown-item"
              >
                {i18n._(msg`About`)}
              </DropdownItem>,
            ]}
          />
        </PageHeaderToolsItem>
        <PageHeaderToolsItem>
          <Dropdown
            id="toolbar-user-dropdown"
            ouiaId="toolbar-user-dropdown"
            isPlain
            isOpen={isUserOpen}
            position={DropdownPosition.right}
            onSelect={handleUserSelect}
            toggle={
              <DropdownToggle
                onToggle={setIsUserOpen}
                ouiaId="toolbar-user-dropdown-toggle"
              >
                <UserIcon />
                {loggedInUser && (
                  <span style={{ marginLeft: '10px' }}>
                    {loggedInUser.username}
                  </span>
                )}
              </DropdownToggle>
            }
            dropdownItems={[
              <DropdownItem
                key="user"
                aria-label={i18n._(msg`User details`)}
                href={
                  loggedInUser ? `#/users/${loggedInUser.id}/details` : '#/home'
                }
                ouiaId="user-dropdown-item"
              >
                {i18n._(msg`User Details`)}
              </DropdownItem>,
              <DropdownItem
                key="logout"
                component="button"
                onClick={onLogoutClick}
                id="logout-button"
                ouiaId="logout-dropdown-item"
              >
                {i18n._(msg`Logout`)}
              </DropdownItem>,
            ]}
          />
        </PageHeaderToolsItem>
      </PageHeaderToolsGroup>
    </PageHeaderTools>
  );
}

PageHeaderToolbar.propTypes = {
  isAboutDisabled: PropTypes.bool,
  onAboutClick: PropTypes.func.isRequired,
  onLogoutClick: PropTypes.func.isRequired,
};

PageHeaderToolbar.defaultProps = {
  isAboutDisabled: false,
};

export default PageHeaderToolbar;
