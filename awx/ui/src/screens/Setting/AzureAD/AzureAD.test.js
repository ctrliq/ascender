import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import AzureAD from './AzureAD';

jest.mock('../../../api');

describe('<AzureAD />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_AZUREAD_OAUTH2_CALLBACK_URL:
          'https://towerhost/sso/complete/azuread-oauth2/',
        SOCIAL_AUTH_AZUREAD_OAUTH2_KEY: 'mock key',
        SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET: '$encrypted$',
        SOCIAL_AUTH_AZUREAD_OAUTH2_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_AZUREAD_OAUTH2_TEAM_MAP: {
          'My Team': {
            users: [],
          },
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderAzure(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/azure/*" element={<AzureAD />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render azure details', async () => {
    renderAzure(['/settings/azure/default/details']);
    expect(
      await screen.findByText('Azure AD OAuth2 Callback URL')
    ).toBeInTheDocument();
  });

  test('should render azure edit', async () => {
    renderAzure(['/settings/azure/default/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderAzure(['/settings/azure/foo/bar/baz']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
