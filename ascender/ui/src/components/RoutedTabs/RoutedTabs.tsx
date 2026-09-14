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

export interface RoutedTabsProps {
  tabsArray: RoutedTab[];
  [key: string]: unknown;
}

function RoutedTabs({ tabsArray }: RoutedTabsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = tabsArray.filter((tab) => tab.link);
  const controls = tabsArray.filter((tab) => !tab.link);

  const getActiveTabId = () => {
    const match = tabs.find((tab) => tab.link === location.pathname);
    if (match) {
      return match.id;
    }
    const subpathMatch = tabs.find((tab) =>
      location.pathname.startsWith(tab.link as string)
    );
    if (subpathMatch) {
      return subpathMatch.id;
    }
    return 0;
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

  const tabList = (
    <PFTabs
      className="awx-routed-tabs__tabs"
      activeKey={getActiveTabId()}
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
    <div className="awx-routed-tabs__tab-bar">
      {tabList}
      {controls.map((control) => (
        <div className="awx-routed-tabs__tab-bar-control" key={control.id}>
          {control.name}
        </div>
      ))}
    </div>
  );
}

export default RoutedTabs;
