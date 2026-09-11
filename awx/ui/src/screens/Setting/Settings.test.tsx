import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsAPI, RootAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockAllOptions from './shared/data.allSettingOptions.json';
import Settings from './Settings';

vi.mock('../../api');

describe('<Settings />', () => {
  beforeEach(() => {
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(SettingsAPI.readAllOptions).mockResolvedValue({
      data: mockAllOptions,
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should redirect users without system admin or auditor permissions', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/settings/*" element={<Settings />} />
        <Route path="*" element={null} />
      </Routes>,
      {
        context: {
          router: {
            history,
          },
          config: {
            me: {
              is_superuser: false,
              is_system_auditor: false,
            },
          },
        },
      }
    );
    // The redirect is a <Navigate>, so it lands in an effect after the
    // loading state clears rather than with it.
    await waitFor(() => expect(history.location.pathname).toBe('/'));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Authentication')).not.toBeInTheDocument();
  });

  test('should render Settings for users with system admin or auditor permissions', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/settings/*" element={<Settings />} />
      </Routes>,
      {
        context: {
          router: {
            history,
          },
          config: {
            me: {
              is_superuser: true,
              is_system_auditor: true,
            },
          },
        },
      }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(await screen.findByText('Authentication')).toBeInTheDocument();
  });

  test('should render content error on throw', async () => {
    vi.mocked(SettingsAPI.readAllOptions).mockRejectedValue(new Error());
    renderWithContexts(<Settings />);
    expect(
      await screen.findByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
