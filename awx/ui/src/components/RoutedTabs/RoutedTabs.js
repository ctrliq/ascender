import React from 'react';
import {
  Tab as PFTab,
  Tabs as PFTabs,
  TabTitleText,
} from '@patternfly/react-core';
import { useLocation, useNavigate } from 'react-router';
import styled from 'styled-components';
import { getPersistentFilters } from 'components/PersistentFilters';

const Tabs = styled(PFTabs)`
  & > ul {
    flex-grow: 1;
  }
`;

const Tab = styled(PFTab)`
  ${(props) => props.hasstyle && `${props.hasstyle}`}
`;

function RoutedTabs({ tabsArray }) {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTabId = () => {
    const match = tabsArray.find((tab) => tab.link === location.pathname);
    if (match) {
      return match.id;
    }
    const subpathMatch = tabsArray.find((tab) =>
      location.pathname.startsWith(tab.link)
    );
    if (subpathMatch) {
      return subpathMatch.id;
    }
    return 0;
  };

  const handleTabSelect = (event, eventKey) => {
    const match = tabsArray.find((tab) => tab.id === eventKey);
    // A tab can exist only to host a control in the tab bar, the workflow job
    // selector being the one that does, and carries no link. Clicks inside such
    // a control bubble up to the tab, so treating this as tab navigation would
    // call navigate(undefined), land back on the current url, and undo whatever
    // the control itself just did.
    if (!match || !match.link) {
      return;
    }
    event.preventDefault();
    const link = match.persistentFilterKey
      ? `${match.link}${getPersistentFilters(match.persistentFilterKey)}`
      : match.link;
    navigate(link);
  };
  return (
    <Tabs
      activeKey={getActiveTabId()}
      onSelect={handleTabSelect}
      ouiaId="routed-tabs"
    >
      {tabsArray.map((tab) => (
        <Tab
          aria-label={typeof tab.name === 'string' ? tab.name : null}
          eventKey={tab.id}
          key={tab.id}
          // a tab that hosts a control has no link to point at, and passing the
          // `false` this used to produce is not a valid href value
          href={!tab.hasstyle && tab.link ? `#${tab.link}` : undefined}
          title={<TabTitleText>{tab.name}</TabTitleText>}
          aria-controls=""
          ouiaId={`${tab.name}-tab`}
          hasstyle={tab.hasstyle}
        />
      ))}
    </Tabs>
  );
}

export default RoutedTabs;
