//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import styled from 'styled-components';
import {
	Button,
	Dropdown,
	DropdownItem,
	DropdownList,
	MenuToggle,
	NotificationBadge,
	NotificationBadgeVariant,
	Tooltip
} from '@patternfly/react-core';
import { MoonIcon, QuestionCircleIcon, SunIcon, UserIcon } from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import useWsPendingApprovalCount from './useWsPendingApprovalCount';

const ToolbarItems = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 1;
  gap: 1.25rem;
`;

const ToolbarNotificationBadge = styled(NotificationBadge)`
  &.pf-v6-c-button.pf-m-stateful {
    --pf-v6-c-button--m-read--BackgroundColor: transparent;
    --pf-v6-c-button--m-read--BorderColor: transparent;
    --pf-v6-c-button--m-read--hover--BackgroundColor: #12a66f;
    --pf-v6-c-button--m-read--hover--BorderColor: transparent;
    --pf-v6-c-button--m-read--m-clicked--BackgroundColor: #0e8c5d;
    --pf-v6-c-button--m-read--m-clicked--BorderColor: transparent;
    padding: var(--pf-v6-global--spacer--xs);
  }
`;

const UserName = styled.span`
  margin-left: 1rem;
  font-size: var(--pf-v6-global--FontSize--md);
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
      document.documentElement.classList.add('pf-v6-theme-dark');
      import('../../darkmode.css');
    } else {
      document.documentElement.classList.remove('pf-v6-theme-dark');
      import('../../lightmode.css');
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

  return (
    <ToolbarItems>
      <Tooltip position="bottom" content={isDarkMode ? t`Switch to light mode` : t`Switch to dark mode`}>
        <Button icon={isDarkMode ? <SunIcon /> : <MoonIcon />}
          variant="plain"
          onClick={toggleDarkMode}
          aria-label={isDarkMode ? t`Switch to light mode` : t`Switch to dark mode`}
         />
      </Tooltip>
      <Tooltip
        position="bottom"
        content={t`Pending Workflow Approvals`}
      >
        <Link to="/workflow_approvals?workflow_approvals.status=pending">
          <ToolbarNotificationBadge
            id="toolbar-workflow-approval-badge"
            count={pendingApprovalsCount}
            variant={
              pendingApprovalsCount === 0
                ? NotificationBadgeVariant.read
                : NotificationBadgeVariant.unread
            }
          />
        </Link>
      </Tooltip>
      <Dropdown
        isOpen={isHelpOpen}
        onSelect={() => setIsHelpOpen(false)}
        onOpenChange={setIsHelpOpen}
        popperProps={{ position: 'right' }}
        ouiaId="toolbar-info-dropdown"
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="plainText"
            onClick={() => setIsHelpOpen(!isHelpOpen)}
            isExpanded={isHelpOpen}
            aria-label={t`Info`}
            ouiaId="toolbar-info-dropdown-toggle"
          >
            <QuestionCircleIcon />
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem
            key="help"
            target="_blank"
            to={`${getDocsBaseUrl(config)}/userguide/index.html`}
            ouiaId="help-dropdown-item"
          >
            {t`Help`}
          </DropdownItem>
          <DropdownItem
            key="about"
            isDisabled={isAboutDisabled}
            onClick={onAboutClick}
            ouiaId="about-dropdown-item"
          >
            {t`About`}
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      <Dropdown
        id="toolbar-user-dropdown"
        ouiaId="toolbar-user-dropdown"
        isOpen={isUserOpen}
        onSelect={() => setIsUserOpen(false)}
        onOpenChange={setIsUserOpen}
        popperProps={{ position: 'right' }}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            variant="plainText"
            onClick={() => setIsUserOpen(!isUserOpen)}
            isExpanded={isUserOpen}
            ouiaId="toolbar-user-dropdown-toggle"
          >
            <UserIcon />
            {loggedInUser &&
                <UserName>{loggedInUser.username}</UserName>
            }
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem
            key="user"
            aria-label={t`User details`}
            to={
              loggedInUser ? `#/users/${loggedInUser.id}/details` : '#/home'
            }
            ouiaId="user-dropdown-item"
          >
            {t`User Details`}
          </DropdownItem>
          <DropdownItem
            key="logout"
            onClick={onLogoutClick}
            id="logout-button"
            ouiaId="logout-dropdown-item"
          >
            {t`Logout`}
          </DropdownItem>
        </DropdownList>
      </Dropdown>
    </ToolbarItems>
  );
}

export default PageHeaderToolbar;
