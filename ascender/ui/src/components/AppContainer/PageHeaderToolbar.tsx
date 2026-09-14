//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  NotificationBadge,
  NotificationBadgeVariant,
  Tooltip,
} from '@patternfly/react-core';
import {
  PaletteIcon,
  QuestionCircleIcon,
  UserIcon,
} from '@patternfly/react-icons';
import { WorkflowApprovalsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import { getThemes, applyTheme, getStoredThemeId } from 'themeRegistry';
import useWsPendingApprovalCount from './useWsPendingApprovalCount';
import './PageHeaderToolbar.css';

export interface PageHeaderToolbarProps {
  isAboutDisabled?: boolean;
  onAboutClick: () => void;
  onLogoutClick: () => void;
  /** The signed in user, from the config; absent until it has been read. */
  loggedInUser?: { username?: string; id?: number; [key: string]: unknown };
  [key: string]: unknown;
}

function PageHeaderToolbar({
  isAboutDisabled = false,
  onAboutClick,
  onLogoutClick,
  loggedInUser,
}: PageHeaderToolbarProps) {
  const { t } = useLingui();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [currentThemeId, setCurrentThemeId] = useState(getStoredThemeId);

  useEffect(() => {
    // A CustomEvent the theme switcher dispatches, carrying the new theme id.
    const handler = (e: Event) =>
      setCurrentThemeId((e as CustomEvent<string>).detail);
    window.addEventListener('themechange', handler);
    return () => window.removeEventListener('themechange', handler);
  }, []);

  const themes = getThemes();

  const handleThemeSelect = (themeId: string) => {
    setIsThemeOpen(false);
    const theme = applyTheme(themeId, true);
    setCurrentThemeId(theme.id);
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
    <div className="awx-page-header-toolbar__items">
      <Dropdown
        isOpen={isThemeOpen}
        onSelect={() => setIsThemeOpen(false)}
        onOpenChange={setIsThemeOpen}
        popperProps={{ position: 'right' }}
        ouiaId="toolbar-theme-dropdown"
        toggle={(toggleRef) => (
          <Tooltip position="bottom" content={t`Theme`}>
            <MenuToggle
              ref={toggleRef}
              variant="plain"
              onClick={() => setIsThemeOpen(!isThemeOpen)}
              isExpanded={isThemeOpen}
              aria-label={t`Theme`}
              ouiaId="toolbar-theme-dropdown-toggle"
            >
              <PaletteIcon />
            </MenuToggle>
          </Tooltip>
        )}
      >
        <DropdownList>
          {themes.map((theme) => (
            <DropdownItem
              key={theme.id}
              onClick={() => handleThemeSelect(theme.id)}
              isSelected={currentThemeId === theme.id}
              ouiaId={`theme-${theme.id}-dropdown-item`}
            >
              {theme.name}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
      <Tooltip position="bottom" content={t`Pending Workflow Approvals`}>
        {/* The badge is the link rather than a button inside one: a bell icon
            with no text names nothing, and the button it used to render did
            nothing of its own, so it was a second tab stop with no purpose. */}
        <NotificationBadge
          className="awx-page-header-toolbar__notification-badge"
          id="toolbar-workflow-approval-badge"
          component={Link}
          to="/workflow_approvals?workflow_approvals.status=pending"
          aria-label={t`Pending Workflow Approvals`}
          count={pendingApprovalsCount as number}
          variant={
            pendingApprovalsCount === 0
              ? NotificationBadgeVariant.read
              : NotificationBadgeVariant.unread
          }
        />
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
            {loggedInUser && (
              <span className="awx-page-header-toolbar__user-name">
                {loggedInUser.username}
              </span>
            )}
          </MenuToggle>
        )}
      >
        <DropdownList>
          <DropdownItem
            key="user"
            aria-label={t`User details`}
            to={loggedInUser ? `#/users/${loggedInUser.id}/details` : '#/home'}
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
    </div>
  );
}

export default PageHeaderToolbar;
