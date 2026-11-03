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

function renderTabs(initialEntry: string) {
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

describe('<RoutedTabs /> active tab', () => {
  // Every detail screen puts a Back tab first, linking the list the other
  // tabs sit under, so its link is a prefix of all of theirs.
  const backTabs = [
    { name: 'Back to Users', link: '/users', id: 0 },
    { name: 'Details', link: '/users/7/details', id: 1 },
    { name: 'Tokens', link: '/users/7/tokens', id: 2 },
  ];

  function renderBackTabs(initialEntry: string) {
    const history = createMemoryHistory({ initialEntries: [initialEntry] });
    return renderWithContexts(
      <Routes>
        <Route path="/users/*" element={<RoutedTabs tabsArray={backTabs} />} />
      </Routes>,
      { context: { router: { history } } }
    );
  }

  const selected = () =>
    screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('aria-selected') === 'true');

  test('a page below a tab keeps that tab active', () => {
    renderBackTabs('/users/7/tokens/3/details');
    expect(screen.getByRole('tab', { name: 'Tokens' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(selected()).toHaveLength(1);
  });

  test('an unknown sub-page leaves no tab active, Back included', () => {
    renderBackTabs('/users/7/bogus');
    expect(selected()).toHaveLength(0);
  });

  test('a link only matches on a whole path segment', () => {
    renderBackTabs('/users/7/tokens_extra');
    expect(selected()).toHaveLength(0);
  });

  test('Back alone, while the page loads, is not taken as the page', () => {
    const history = createMemoryHistory({ initialEntries: ['/users/7'] });
    renderWithContexts(
      <Routes>
        <Route
          path="/users/*"
          element={<RoutedTabs tabsArray={backTabs.slice(0, 1)} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(selected()).toHaveLength(0);
  });

  test('Back is still the active tab on the list it links', () => {
    const history = createMemoryHistory({ initialEntries: ['/users'] });
    renderWithContexts(
      <Routes>
        <Route
          path="/users/*"
          element={<RoutedTabs tabsArray={backTabs.slice(0, 1)} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(selected()).toHaveLength(1);
  });

  test('no active tab does not fall back to the tab with id 0', () => {
    renderTabs('/organizations/19/bogus');
    expect(selected()).toHaveLength(0);
  });
});

describe('<RoutedTabs /> with a control beside the tabs', () => {
  // The workflow job selector is registered as an entry with no link, so that
  // it sits in the tab bar. It has to render beside the tab list rather than
  // inside a tab: a tab is a <button>, and so is the selector's own toggle,
  // which is why the control here is a real button.
  const controlTabs = [
    { name: 'Details', link: '/runs/playbook/953/details', id: 0 },
    { name: 'Output', link: '/runs/playbook/953/output', id: 1 },
    {
      name: (
        <button type="button" data-testid="wf-control">
          Job 2/4
        </button>
      ),
      link: undefined,
      id: 2,
    },
  ];

  function renderControlTabs() {
    const history = createMemoryHistory({
      initialEntries: ['/runs/playbook/953/output'],
    });
    const utils = renderWithContexts(
      <Routes>
        <Route
          path="/runs/:typeSegment/:id/*"
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
      expect(history.location.pathname).toBe('/runs/playbook/953/output')
    );
  });

  test('tabs that do have a link still navigate', async () => {
    const { user, history } = renderControlTabs();
    await user.click(screen.getByText('Details'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/runs/playbook/953/details')
    );
  });
});
