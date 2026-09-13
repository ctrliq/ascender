import React from 'react';
import { matchPath, Link, useLocation } from 'react-router';
import { NavExpandable, NavItem } from '@patternfly/react-core';

/** One route the sidebar links to, out of the group's route list. */
interface NavRoute {
  path: string;
  title: React.ReactNode;
}

export interface NavExpandableGroupProps {
  groupId: string;
  groupTitle: React.ReactNode;
  routes: NavRoute[];
}

function NavExpandableGroup({
  groupId,
  groupTitle,
  routes,
}: NavExpandableGroupProps) {
  const location = useLocation();

  // Extract a list of paths from the route params and store them for later. This creates
  // an array of url paths associated with any NavItem component rendered by this component.
  const navItemPaths = routes.map(({ path }) => path);

  const isActive = navItemPaths.some(isActivePath);

  function isActivePath(path: string) {
    return Boolean(matchPath({ path, end: false }, location.pathname));
  }

  if (routes.length === 1 && groupId === 'settings') {
    const { path } = routes[0] as NavRoute;
    return (
      <NavItem itemId={groupId} isActive={isActivePath(path)} key={path}>
        <Link to={path}>{groupTitle}</Link>
      </NavItem>
    );
  }

  return (
    <NavExpandable
      isActive={isActive}
      isExpanded
      groupId={groupId}
      ouiaId={groupId}
      title={groupTitle}
    >
      {routes.map(({ path, title }) => (
        <NavItem groupId={groupId} isActive={isActivePath(path)} key={path}>
          <Link to={path}>{title}</Link>
        </NavItem>
      ))}
    </NavExpandable>
  );
}

export default NavExpandableGroup;
