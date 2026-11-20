import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';

/** One variant of an object, and the screen that lists it. */
export interface ResourceTab {
  label: string;
  path: string;
}

export interface ResourceTabsProps {
  tabs: ResourceTab[];
  ouiaId: string;
  'aria-label': string;
}

/**
 * Whether an address is a page, or sits under one, counting whole segments.
 *
 * Args:
 *     pathname: The address on screen.
 *     path: A tab's address.
 *
 * Returns:
 *     True for the tab's own address and any address beneath it, and false
 *     for one that only begins with the same letters.
 */
export function isUnder(pathname: string, path: string): boolean {
  const base = path.replace(/\/+$/, '');
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The tab bar over a list whose object has variants on screens of their own.
 *
 * The rail names each object once and goes two levels deep and no further, so
 * where there are variants they are tabs here: credential types beside
 * credentials, the topology beside the instances it draws. Each tab is a route,
 * so the address bar still says which is open and a link into one still works.
 */
function ResourceTabs({
  tabs,
  ouiaId,
  'aria-label': ariaLabel,
}: ResourceTabsProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The longest address that the current one sits under, so a tab for a page
  // inside another page's address wins over the page it sits in. Whole
  // segments only: /credential_types is not under /credentials.
  const active =
    [...tabs]
      .sort((a, b) => b.path.length - a.path.length)
      .find(({ path }) => isUnder(pathname, path))?.path ?? tabs[0]?.path;

  // Nothing to switch between, and nothing a bar of no tabs could say.
  if (!tabs.length) {
    return null;
  }

  return (
    <Tabs
      aria-label={ariaLabel}
      activeKey={active}
      onSelect={(_event, eventKey) => navigate(String(eventKey))}
      ouiaId={ouiaId}
    >
      {tabs.map(({ label, path }) => (
        <Tab
          key={path}
          eventKey={path}
          aria-label={label}
          title={<TabTitleText>{label}</TabTitleText>}
          ouiaId={`${ouiaId}-${path}`}
        />
      ))}
    </Tabs>
  );
}

export default ResourceTabs;
