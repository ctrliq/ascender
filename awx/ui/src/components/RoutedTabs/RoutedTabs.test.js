import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RoutedTabs from './RoutedTabs';

const tabs = [
  { name: 'Details', link: '/organizations/19/details', id: 1 },
  { name: 'Access', link: '/organizations/19/access', id: 2 },
  { name: 'Teams', link: '/organizations/19/teams', id: 3 },
  { name: 'Notification', link: '/organizations/19/notification', id: 4 },
];

function renderTabs(initialEntry) {
  const history = createMemoryHistory({
    initialEntries: [initialEntry],
  });
  const utils = renderWithContexts(
    <Routes>
      <Route
        path="/organizations/19/*"
        element={<RoutedTabs tabsArray={tabs} />}
      />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
  return { ...utils, history };
}

describe('<RoutedTabs />', () => {
  test('RoutedTabs renders successfully', () => {
    renderTabs('/organizations/19/teams');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  test('Given a URL the correct tab is active', () => {
    const { history } = renderTabs('/organizations/19/teams');
    expect(history.location.pathname).toEqual('/organizations/19/teams');
    expect(screen.getByRole('tab', { name: 'Teams' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Access' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  test('should update history when new tab selected', async () => {
    const { history, user } = renderTabs('/organizations/19/teams');

    await user.click(screen.getByRole('tab', { name: 'Access' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/organizations/19/access')
    );
    expect(screen.getByRole('tab', { name: 'Access' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});

describe('<RoutedTabs /> with a tab that hosts a control', () => {
  // The workflow job selector is registered as a tab with no link, so that it
  // sits in the tab bar. Clicks on the control inside it bubble to the tab.
  const controlTabs = [
    { name: 'Details', link: '/jobs/playbook/953/details', id: 0 },
    { name: 'Output', link: '/jobs/playbook/953/output', id: 1 },
    {
      // a plain element, not a <button>: the real selector nests a button inside
      // the tab's own button, which React rightly complains about, and the
      // console guard in setupTests turns that complaint into a failure
      name: <span data-testid="wf-control">Workflow Job 2/4</span>,
      link: undefined,
      id: 2,
      hasstyle: 'margin-left: auto',
    },
  ];

  function renderControlTabs() {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/playbook/953/output'],
    });
    const utils = renderWithContexts(
      <Routes>
        <Route
          path="/jobs/:typeSegment/:id/*"
          element={<RoutedTabs tabsArray={controlTabs} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    return { ...utils, history };
  }

  test('a click inside a link-less tab does not navigate', async () => {
    const { user, history } = renderControlTabs();
    await user.click(screen.getByText('Workflow Job 2/4'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/playbook/953/output')
    );
  });

  test('tabs that do have a link still navigate', async () => {
    const { user, history } = renderControlTabs();
    await user.click(screen.getByText('Details'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/playbook/953/details')
    );
  });
});
