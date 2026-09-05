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

describe('<RoutedTabs /> with a control beside the tabs', () => {
  // The workflow job selector is registered as an entry with no link, so that
  // it sits in the tab bar. It has to render beside the tab list rather than
  // inside a tab: a tab is a <button>, and so is the selector's own toggle,
  // which is why the control here is a real button.
  const controlTabs = [
    { name: 'Details', link: '/jobs/playbook/953/details', id: 0 },
    { name: 'Output', link: '/jobs/playbook/953/output', id: 1 },
    {
      name: (
        <button type="button" data-testid="wf-control">
          Workflow Job 2/4
        </button>
      ),
      link: undefined,
      id: 2,
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

  test('renders the control outside the tab list', () => {
    renderControlTabs();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    const control = screen.getByTestId('wf-control');
    expect(control).toBeInTheDocument();
    expect(control.closest('[role="tab"]')).toBeNull();
  });

  test('a click on the control does not navigate', async () => {
    const { user, history } = renderControlTabs();
    await user.click(screen.getByTestId('wf-control'));
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
