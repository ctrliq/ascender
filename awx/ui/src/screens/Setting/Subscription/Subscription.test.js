import React from 'react';
import { Routes, Route } from 'react-router';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsAPI, RootAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllSettings from '../shared/data.allSettings.json';
import Subscription from './Subscription';

jest.mock('../../../api');
SettingsAPI.readCategory.mockResolvedValue({
  data: mockAllSettings,
});
RootAPI.readAssetVariables.mockResolvedValue({
  data: {
    BRAND_NAME: 'AWX',
    PENDO_API_KEY: '',
  },
});

describe('<Subscription />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should redirect to subscription details', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/subscription'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/settings/subscription/*" element={<Subscription />} />
      </Routes>,
      {
        context: {
          router: { history },
          config: {
            license_info: {
              license_type: 'enterprise',
              automated_instances: '1',
              automated_since: '1614714228',
            },
          },
        },
      }
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/subscription/details'
      )
    );
    // SubscriptionDetail renders the read-only subscription type detail
    expect(await screen.findByText('Subscription type')).toBeInTheDocument();
  });
});
