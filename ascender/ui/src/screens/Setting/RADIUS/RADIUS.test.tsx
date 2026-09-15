import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import RADIUS from './RADIUS';

vi.mock('../../../api');

describe('<RADIUS />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        RADIUS_SERVER: 'radius.example.org',
        RADIUS_PORT: 1812,
        RADIUS_SECRET: '$encrypted$',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderRADIUS(initialEntries: string[]) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={settingOptions}>
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
