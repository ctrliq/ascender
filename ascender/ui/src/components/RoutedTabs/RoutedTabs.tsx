import React from 'react';
import { Tab, Tabs as PFTabs, TabTitleText } from '@patternfly/react-core';
import { useLocation, useNavigate } from 'react-router';
import { getPersistentFilters } from 'components/PersistentFilters';
import './RoutedTabs.css';

// A tab bar can carry a control beside its tabs, the workflow job selector
// being the one that does. It used to be registered as a link-less tab, which
// put the selector's <button> inside the tab's own <button>: invalid HTML that
// React reported on every job page inside a workflow. The control now renders
// as a sibling of the tab list. This wrapper is the positioned ancestor, so
// the bottom border PatternFly draws with ::before spans the control as well.

/**
 * One entry of a tab bar. An entry with a link is a tab; one without is a
 * control that renders beside the tabs, which is what the workflow job
 * selector is.
 */
export interface RoutedTab {
  id: number;
  name: React.ReactNode;
  link?: string;
  /** Restores the filters the list under this tab was last left with. */
  persistentFilterKey?: string;
}

/** The activeKey given to PatternFly when the address matches no tab. */
const NO_ACTIVE_TAB = 'ascender-routed-tabs-none';

export interface RoutedTabsProps {
  tabsArray: RoutedTab[];
  [key: string]: unknown;
}

function RoutedTabs({ tabsArray }: RoutedTabsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = tabsArray.filter((tab) => tab.link);
  const controls = tabsArray.filter((tab) => !tab.link);

  // The active tab is the one whose link the address sits under, matched on
  // whole path segments so that /users/1/tokens does not claim
  // /users/1/tokens_extra. A tab whose link is a strict prefix of another
  // tab's link is the Back tab, pointing at the list the others sit under:
  // it would match every sub-page, so it is never taken as the active one.
  // Of the rest the longest match wins, and an address none of them covers,
  // an unknown sub-page, leaves no tab active rather than lighting up Back
  // or Details.
  //
  // While a screen loads, Back can be the only tab, with no other tab under
  // it to give it away, and it would light up as the page itself. So a lone
  // tab the address lies strictly beneath is taken as Back too: every screen
  // opens its bar with Back, pointing up at the list the page sits in, and
  // the page's own tabs arrive with its record.
  const getActiveTabId = (): number | undefined => {
    const { pathname } = location;
    const [only] = tabs;
    const isLoneBack =
      tabs.length === 1 &&
      only !== undefined &&
      pathname.startsWith(`${only.link}/`);
    const candidates = tabs.filter(
      (tab) =>
        !isLoneBack &&
        !tabs.some(
          (other) =>
            other !== tab && (other.link as string).startsWith(`${tab.link}/`)
        )
    );
    let best: RoutedTab | undefined;
    candidates.forEach((tab) => {
      const link = tab.link as string;
      const matches = pathname === link || pathname.startsWith(`${link}/`);
      if (matches && (!best || link.length > (best.link as string).length)) {
        best = tab;
      }
    });
    return best?.id;
  };

  const handleTabSelect = (
    event: React.MouseEvent,
    eventKey: number | string
  ) => {
    const match = tabs.find((tab) => tab.id === eventKey);
    if (!match?.link) {
      return;
    }
    event.preventDefault();
    const link = match.persistentFilterKey
      ? `${match.link}${getPersistentFilters(match.persistentFilterKey)}`
      : match.link;
    navigate(link);
  };

  // PatternFly's Tabs defaults activeKey to 0, which is the id of the first
  // tab on most screens, so "no active tab" has to be a key no tab carries.
  // With no tab current the accent underline would stay wherever it was last
  // drawn, which the modifier class hides.
  const activeTabId = getActiveTabId();
  const tabList = (
    <PFTabs
      className={
        activeTabId === undefined
          ? 'ascender-routed-tabs__tabs ascender-routed-tabs__tabs--no-current'
          : 'ascender-routed-tabs__tabs'
      }
      activeKey={activeTabId ?? NO_ACTIVE_TAB}
      onSelect={handleTabSelect}
      ouiaId="routed-tabs"
    >
      {tabs.map((tab) => (
        <Tab
          aria-label={typeof tab.name === 'string' ? tab.name : undefined}
          eventKey={tab.id}
          key={tab.id}
          href={`#${tab.link}`}
          title={<TabTitleText>{tab.name}</TabTitleText>}
          aria-controls=""
          ouiaId={`${tab.name}-tab`}
        />
      ))}
    </PFTabs>
  );

  if (controls.length === 0) {
    return tabList;
  }
  return (
    <div className="ascender-routed-tabs__tab-bar">
      {tabList}
      {/* One box for all of them: an auto margin on each would share the free
          space out between them and leave the first stranded in the middle of
          the bar, rather than the group sitting at the end of it. */}
      <div className="ascender-routed-tabs__tab-bar-controls">
        {controls.map((control) => (
          <div
            className="ascender-routed-tabs__tab-bar-control"
            key={control.id}
          >
            {control.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RoutedTabs;
