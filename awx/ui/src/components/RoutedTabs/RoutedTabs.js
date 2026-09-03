import React from 'react';
import { Tab, Tabs as PFTabs, TabTitleText } from '@patternfly/react-core';
import { useLocation, useNavigate } from 'react-router';
import styled from 'styled-components';
import { getPersistentFilters } from 'components/PersistentFilters';

const Tabs = styled(PFTabs)`
  & > ul {
    flex-grow: 1;
  }
`;

// A tab bar can carry a control beside its tabs, the workflow job selector
// being the one that does. It used to be registered as a link-less tab, which
// put the selector's <button> inside the tab's own <button>: invalid HTML that
// React reported on every job page inside a workflow. The control now renders
// as a sibling of the tab list. This wrapper is the positioned ancestor, so
// the bottom border PatternFly draws with ::before spans the control as well.
const TabBar = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  & > .pf-v6-c-tabs {
    position: static;
    flex-grow: 1;
  }
`;

const TabBarControl = styled.div`
  margin-inline-start: auto;
  padding-inline-end: var(--pf-t--global--spacer--md);
`;

function RoutedTabs({ tabsArray }) {
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
      location.pathname.startsWith(tab.link)
    );
    if (subpathMatch) {
      return subpathMatch.id;
    }
    return 0;
  };

  const handleTabSelect = (event, eventKey) => {
    const match = tabs.find((tab) => tab.id === eventKey);
    if (!match) {
      return;
    }
    event.preventDefault();
    const link = match.persistentFilterKey
      ? `${match.link}${getPersistentFilters(match.persistentFilterKey)}`
      : match.link;
    navigate(link);
  };

  const tabList = (
    <Tabs
      activeKey={getActiveTabId()}
      onSelect={handleTabSelect}
      ouiaId="routed-tabs"
    >
      {tabs.map((tab) => (
        <Tab
          aria-label={typeof tab.name === 'string' ? tab.name : null}
          eventKey={tab.id}
          key={tab.id}
          href={`#${tab.link}`}
          title={<TabTitleText>{tab.name}</TabTitleText>}
          aria-controls=""
          ouiaId={`${tab.name}-tab`}
        />
      ))}
    </Tabs>
  );

  if (controls.length === 0) {
    return tabList;
  }
  return (
    <TabBar>
      {tabList}
      {controls.map((control) => (
        <TabBarControl key={control.id}>{control.name}</TabBarControl>
      ))}
    </TabBar>
  );
}

export default RoutedTabs;
