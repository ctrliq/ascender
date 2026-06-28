import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import RADIUS from './RADIUS';

jest.mock('../../../api');

describe('<RADIUS />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        RADIUS_SERVER: 'radius.example.org',
        RADIUS_PORT: 1812,
        RADIUS_SECRET: '$encrypted$',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderRADIUS(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/radius/*" element={<RADIUS />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render RADIUS details', async () => {
    renderRADIUS(['/settings/radius/details']);
    expect(await screen.findByText('RADIUS Server')).toBeInTheDocument();
  });

  test('should render RADIUS edit', async () => {
    renderRADIUS(['/settings/radius/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderRADIUS(['/settings/radius/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
