import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import OIDC from './OIDC';

jest.mock('../../../api');

describe('<OIDC />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_OIDC_KEY: 'mock key',
        SOCIAL_AUTH_OIDC_SECRET: '$encrypted$',
        SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
        SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderOIDC(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/oidc/*" element={<OIDC />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render OIDC details', async () => {
    renderOIDC(['/settings/oidc/details']);
    expect(await screen.findByText('OIDC Key')).toBeInTheDocument();
  });

  test('should render OIDC edit', async () => {
    renderOIDC(['/settings/oidc/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderOIDC(['/settings/oidc/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
