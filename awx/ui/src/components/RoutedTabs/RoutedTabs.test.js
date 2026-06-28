
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
