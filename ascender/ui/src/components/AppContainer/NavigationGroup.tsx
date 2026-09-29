import React, { useLayoutEffect, useRef, useState } from 'react';
import { matchPath, Link, useLocation } from 'react-router';
import { Badge, NavExpandable, NavItem } from '@patternfly/react-core';
import type { AppRoute } from '../../routeConfig';
import { isGroupExpanded, setGroupExpanded } from './navGroupState';

/**
 * How long a group of a given height takes to open.
 *
 * One duration for every group means the tall ones travel three times as far
 * in the same time, and read as snapping open where the short ones glide. The
 * time is taken from the distance instead, so they all open at the same
 * apparent speed, with a floor so a two item group is not instant and a
 * ceiling so the tallest never drags.
 */
const PIXELS_PER_MS = 0.8;
const SHORTEST_MS = 140;
const LONGEST_MS = 320;

export function openingMs(height: number) {
  return Math.round(
    Math.min(LONGEST_MS, Math.max(SHORTEST_MS, height / PIXELS_PER_MS))
  );
}

/**
 * Brings a group the person has just opened into view, once it has opened.
 *
 * The rail is taller than the window before a single group is open, so the
 * last ones open below the fold: the list grows where it cannot be seen and
 * only the scroll bar says anything happened. Once the group has finished
 * opening it is scrolled into view, smoothly unless the person asked for less
 * motion, and by no more than it takes: `nearest` leaves a group already in
 * view where it is, and one taller than the rail stops with its heading at
 * the top rather than pushing its own name away.
 *
 * Args:
 *     group: The group's own list item, heading and items.
 *     subnav: The part of it that animates open.
 *     ms: How long it takes to open, after which it is scrolled to whether
 *         or not the animation said it had ended.
 *
 * Returns:
 *     The way to call it off, for a group closed again before it has opened.
 */
function revealWhenOpened(group: Element, subnav: HTMLElement, ms: number) {
  const still = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  )?.matches;

  function stop() {
    window.clearTimeout(timer);
    subnav.removeEventListener('transitionend', onEnd);
  }

  function reveal() {
    stop();
    group.scrollIntoView?.({
      block: 'nearest',
      behavior: still ? 'auto' : 'smooth',
    });
  }

  // Only the group's own height: its items animate colours of their own, and
  // those end first.
  function onEnd(event: TransitionEvent) {
    if (event.target === subnav && event.propertyName === 'max-height') {
      reveal();
    }
  }

  // The timer is the fallback where there is no animation to end, reduced
  // motion among them, and the ceiling for one that never reports one.
  const timer = window.setTimeout(reveal, still ? 0 : ms + 100);
  subnav.addEventListener('transitionend', onEnd);

  return stop;
}

export interface NavigationGroupProps {
  groupId: string;
  /** The heading over the group, or null for an item pinned above them all. */
  groupTitle: string | null;
  routes: AppRoute[];
  /** Approvals waiting on this user, which only the approvals item shows. */
  approvalCount?: number;
}

/**
 * One group of the sidebar: a heading that opens and closes, and the items
 * under it.
 *
 * The rail is eight groups now where it was five, so a long one can be folded
 * away: the heading is the same control it has always been, caret and all, and
 * only the groups and their names have changed. A group with no title is the
 * dashboard, pinned above them as a plain item.
 */
function NavigationGroup({
  groupId,
  groupTitle,
  routes,
  approvalCount = 0,
}: NavigationGroupProps) {
  const location = useLocation();
  // Read once, on the first render of the group: what the person left closed
  // stays closed until they open it again.
  const [isExpanded, setIsExpanded] = useState(() => isGroupExpanded(groupId));
  // A group opened by hand is brought into view; one restored from the last
  // visit is not, or the rail would jump on every page load.
  const openedByHand = useRef(false);
  // How to call off bringing a group into view, for one shut again before it
  // has finished opening.
  const stopRevealing = useRef<(() => void) | undefined>(undefined);
  // What the group lists, by path. The routes arrive as a new array on every
  // render of the rail, and keyed on the array the measuring below was torn
  // down and set up again each time, observer and all.
  const routeKey = routes
    .filter(({ isHiddenFromNav }) => !isHiddenFromNav)
    .map(({ path }) => path)
    .join('\n');

  // What the group measures when it is open, handed to the stylesheet so the
  // height it animates ends where the items end rather than at a guess. The
  // list is PatternFly's own, so it is found through the id PatternFly puts on
  // the group, and watched because an item's label wraps at some widths and
  // each theme spaces the rows differently.
  useLayoutEffect(() => {
    // Only while the group is open, which is the state whose height is being
    // measured: closed, it has already given up the padding above its list.
    if (!isExpanded) {
      return undefined;
    }

    const group = document.querySelector(
      `li[data-ouia-component-id="${groupId}"]`
    );
    const subnav = group?.querySelector<HTMLElement>(
      ':scope > .pf-v6-c-nav__subnav'
    );
    const list = subnav?.firstElementChild;

    if (!group || !subnav || !list) {
      return undefined;
    }

    const measure = () => {
      if (list.scrollHeight > 0) {
        // The list's own height, plus what the group keeps above it and under
        // its last item: a ceiling set to the list alone cuts that last item
        // off the bottom of the group.
        const styles = window.getComputedStyle(subnav);
        const room =
          parseFloat(styles.paddingBlockStart) +
          parseFloat(styles.paddingBlockEnd);
        const height = list.scrollHeight + room;
        const ceiling = `${height}px`;

        // Only when it has actually changed: setting the ceiling again mid
        // animation starts the animation again, and a group that keeps
        // starting never reaches its end.
        if (
          subnav.style.getPropertyValue('--ascender-nav-group-height') !==
          ceiling
        ) {
          subnav.style.setProperty('--ascender-nav-group-height', ceiling);
          subnav.style.setProperty(
            '--ascender-nav-group-duration',
            `${openingMs(height)}ms`
          );
        }

        if (openedByHand.current) {
          openedByHand.current = false;
          stopRevealing.current?.();
          stopRevealing.current = revealWhenOpened(
            group,
            subnav,
            openingMs(height)
          );
        }
      }
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(list);

    return () => {
      observer.disconnect();
      stopRevealing.current?.();
    };
  }, [groupId, routeKey, isExpanded]);

  const isActivePath = (path: string) =>
    Boolean(matchPath({ path, end: false }, location.pathname));

  // Routes the rail does not name: a credential type is a tab of Credentials,
  // the topology a tab of Instances, and the settings screen is the pages the
  // group already lists.
  const items = routes.filter(({ isHiddenFromNav }) => !isHiddenFromNav);

  if (items.length === 0) {
    return null;
  }

  // An item is current while one of its own tabs is open, which is how the
  // rail keeps naming where you are on a screen it does not list.
  const isItemActive = (path: string) =>
    isActivePath(path) ||
    routes.some((route) => route.tabOf === path && isActivePath(route.path));

  const isActive = items.some(({ path }) => isItemActive(path));

  const navItems = items.map(({ path, title, hasApprovalBadge }) => (
    <NavItem
      groupId={groupId}
      isActive={isItemActive(path)}
      key={path}
      ouiaId={`nav-item-${path}`}
    >
      <Link to={path}>
        {title}
        {/* The one badge in the rail, and only while something waits: a zero
            beside Approvals reads as a state to clear rather than nothing to
            do. */}
        {hasApprovalBadge && approvalCount > 0 ? (
          <Badge className="ascender-navigation__badge" isRead={false}>
            {approvalCount}
          </Badge>
        ) : null}
      </Link>
    </NavItem>
  ));

  if (groupTitle === null) {
    return <>{navItems}</>;
  }

  return (
    <NavExpandable
      groupId={groupId}
      isActive={isActive}
      isExpanded={isExpanded}
      onExpand={(_event, expanded) => {
        openedByHand.current = expanded;
        setIsExpanded(expanded);
        setGroupExpanded(groupId, expanded);
      }}
      ouiaId={groupId}
      title={groupTitle}
    >
      {navItems}
    </NavExpandable>
  );
}

export default NavigationGroup;
