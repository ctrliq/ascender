//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  NotificationBadge,
  NotificationBadgeVariant,
} from '@patternfly/react-core';
import {
  CheckIcon,
  ExternalLinkAltIcon,
  PaletteIcon,
  QuestionCircleIcon,
  UserIcon,
} from '@patternfly/react-icons';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import { getThemes, applyTheme, getStoredThemeId } from 'themeRegistry';
import { saveThemeToAccount } from '../../accountTheme';
import './PageHeaderToolbar.css';
import Tooltip from '../Tooltip';

export interface PageHeaderToolbarProps {
  /** Approvals waiting on this user, counted once by the container. */
  approvalCount?: number;
  isAboutDisabled?: boolean;
  onAboutClick: () => void;
  onLogoutClick: () => void;
  /** The signed in user, from the config; absent until it has been read. */
  loggedInUser?: { username?: string; id?: number; [key: string]: unknown };
  [key: string]: unknown;
}

function PageHeaderToolbar({
  approvalCount = 0,
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
    // Applied and cached locally already; recording it on the account is
    // what carries it to the user's other browsers.
    if (loggedInUser?.id) {
      saveThemeToAccount(loggedInUser.id, theme.id);
    }
  };

  const config = useConfig();

  // The container reads the count, so the bell and the rail's badge are the
  // same number read once rather than two requests for the same thing.
  const pendingApprovalsCount = approvalCount;

  return (
    <div className="ascender-page-header-toolbar__items">
      <Tooltip position="bottom" content={t`Pending Workflow Approvals`}>
        {/* The badge is the link rather than a button inside one: a bell icon
            with no text names nothing, and the button it used to render did
            nothing of its own, so it was a second tab stop with no purpose. */}
        <NotificationBadge
          className="ascender-page-header-toolbar__notification-badge"
          id="toolbar-workflow-approval-badge"
          component={Link}
          to="/approvals?workflow_approvals.status=pending"
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
        className="ascender-theme-menu"
        isOpen={isThemeOpen}
        onSelect={() => setIsThemeOpen(false)}
        onOpenChange={setIsThemeOpen}
        popperProps={{ position: 'right' }}
        ouiaId="toolbar-theme-dropdown"
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            // plainText rather than plain, so the toggle draws the caret the
            // help and user menus draw. In this masthead a caret means the
            // control opens a menu, and the notification bell beside it is a
            // button with no menu, so the distinction carries information.
            variant="plainText"
            onClick={() => setIsThemeOpen(!isThemeOpen)}
            isExpanded={isThemeOpen}
            aria-label={t`Theme`}
            ouiaId="toolbar-theme-dropdown-toggle"
          >
            <PaletteIcon />
          </MenuToggle>
        )}
      >
        <DropdownList>
          {themes.map((theme) => (
            <DropdownItem
              key={theme.id}
              onClick={() => handleThemeSelect(theme.id)}
              isSelected={currentThemeId === theme.id}
              // The tick reads before the name rather than after it, which is
              // where a menu of mutually exclusive options puts it everywhere
              // outside the browser. isSelected stays for aria-selected, and
              // the icon it would draw on the trailing edge is hidden in the
              // stylesheet. The unselected rows carry an empty icon of the
              // same size so the names stay in one column.
              icon={
                currentThemeId === theme.id ? (
                  // Labelled rather than hidden: PatternFly marks the selected
                  // row with a class and no aria-selected, so the tick is the
                  // only thing that says which theme is on, and a decorative
                  // icon would say it to nobody using a screen reader.
                  <CheckIcon aria-label={t`Current theme`} />
                ) : (
                  <span aria-hidden className="ascender-theme-menu__no-tick" />
                )
              }
              ouiaId={`theme-${theme.id}-dropdown-item`}
            >
              {theme.name}
            </DropdownItem>
          ))}
        </DropdownList>
      </Dropdown>
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
            // The link leaves the application, which the label alone does not
            // say; the icon is what marks it as going somewhere else.
            icon={<ExternalLinkAltIcon />}
          >
            {t`Documentation`}
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
              <span className="ascender-page-header-toolbar__user-name">
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
