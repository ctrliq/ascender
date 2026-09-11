import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import TACACSDetail from './TACACSDetail';

vi.mock('../../../../api');

describe('<TACACSDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        TACACSPLUS_HOST: 'mockhost',
        TACACSPLUS_PORT: 49,
        TACACSPLUS_SECRET: '$encrypted$',
        TACACSPLUS_SESSION_TIMEOUT: 5,
        TACACSPLUS_AUTH_PROTOCOL: 'ascii',
        TACACSPLUS_REM_ADDR: false,
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(context?: Untyped) {
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <TACACSDetail />
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
    expect(screen.getByText('TACACS+ Server')).toBeInTheDocument();
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
    expect(
      screen.getByText(
        'This feature is deprecated and will be removed in a future release.'
      )
    ).toBeInTheDocument();
    assertDetail('TACACS+ Server', 'mockhost');
    assertDetail('TACACS+ Port', '49');
    assertDetail('TACACS+ Secret', 'Encrypted');
    assertDetail('TACACS+ Auth Session Timeout', '5 seconds');
    assertDetail('TACACS+ Authentication Protocol', 'ascii');
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
