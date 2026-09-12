import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { RenderWithContextsOptions } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import OIDCDetail from './OIDCDetail';

vi.mock('../../../../api');

describe('<OIDCDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        SOCIAL_AUTH_OIDC_KEY: 'mock key',
        SOCIAL_AUTH_OIDC_SECRET: '$encrypted$',
        SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
        SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(context?: RenderWithContextsOptions) {
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <OIDCDetail />
      </SettingsProvider>,
      context
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderDetail();
    expect(screen.getByText('OIDC Key')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    expect(
      screen.getAllByRole('tab', { name: /Back to Settings/ }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('tab', { name: /Details/ }).length
    ).toBeGreaterThan(0);
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail('OIDC Key', 'mock key');
    assertDetail('OIDC Secret', 'Encrypted');
    assertDetail('OIDC Provider URL', 'https://example.com');
    assertDetail('Verify OIDC Provider Certificate', 'On');
  });

  test('should hide edit button from non-superusers', async () => {
    await renderDetail({
      context: { config: { me: { is_superuser: false } } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    vi.mocked(SettingsAPI.readCategory).mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
