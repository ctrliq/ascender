//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
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
import { MoonIcon, QuestionCircleIcon, SunIcon, UserIcon } from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import useWsPendingApprovalCount from './useWsPendingApprovalCount';

const PendingWorkflowApprovals = styled.div`
  display: flex;
  align-items: center;
  padding: var(--pf-global--spacer--md);
  margin-right: var(--pf-global--spacer--md);
`;

const UserName = styled.span`
  margin-left: var(--pf-global--spacer--md);
  font-size: var(--pf-global--FontSize--sm);
`;

function PageHeaderToolbar({
  isAboutDisabled = false,
  onAboutClick,
  onLogoutClick,
  loggedInUser,
}) {
  const { t } = useLingui();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => {
      const storedDarkMode = localStorage.getItem('darkMode');

      return storedDarkMode !== null
        ? storedDarkMode === 'true'
        : typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  );

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) {
      document.documentElement.classList.add('pf-theme-dark');
      import('../../darkmode.css');
    } else {
      document.documentElement.classList.remove('pf-theme-dark');
    }
    localStorage.setItem('darkMode', next);
    window.dispatchEvent(new Event('resize'));
  };
  const config = useConfig();

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
        <Tooltip position="bottom" content={isDarkMode ? t`Switch to light mode` : t`Switch to dark mode`}>
          <PageHeaderToolsItem>
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={isDarkMode ? t`Switch to light mode` : t`Switch to dark mode`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 'var(--pf-global--spacer--md)',
                color: 'var(--pf-global--Color--100)',
                fontSize: 'var(--pf-global--FontSize--md)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </PageHeaderToolsItem>
        </Tooltip>
        <Tooltip
          position="bottom"
          content={t`Pending Workflow Approvals`}
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
                aria-label={t`Info`}
                ouiaId="toolbar-info-dropdown-toggle"
              >
                <QuestionCircleIcon />
              </DropdownToggle>
            }
            dropdownItems={[

              <DropdownItem
                key="help"
                target="_blank"
                href={`${getDocsBaseUrl(config)}/userguide/index.html`}
                ouiaId="help-dropdown-item"
                rel="noopener noreferrer"
              >
                {t`Help`}
              </DropdownItem>,

              <DropdownItem
                key="about"
                component="button"
                isDisabled={isAboutDisabled}
                onClick={onAboutClick}
                ouiaId="about-dropdown-item"
              >
                {t`About`}
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
                {loggedInUser &&
                    <UserName>{loggedInUser.username}</UserName>
                }
              </DropdownToggle>
            }
            dropdownItems={[
              <DropdownItem
                key="user"
                aria-label={t`User details`}
                href={
                  loggedInUser ? `#/users/${loggedInUser.id}/details` : '#/home'
                }
                ouiaId="user-dropdown-item"
              >
                {t`User Details`}
              </DropdownItem>,
              <DropdownItem
                key="logout"
                component="button"
                onClick={onLogoutClick}
                id="logout-button"
                ouiaId="logout-dropdown-item"
              >
                {t`Logout`}
              </DropdownItem>,
            ]}
          />
        </PageHeaderToolsItem>
      </PageHeaderToolsGroup>
    </PageHeaderTools>
  );
}

export default PageHeaderToolbar;
