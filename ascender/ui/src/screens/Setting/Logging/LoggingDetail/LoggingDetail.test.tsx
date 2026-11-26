import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { RenderWithContextsOptions } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockLogSettings from '../../shared/data.logSettings.json';
import LoggingDetail from './LoggingDetail';

vi.mock('../../../../api');

describe('<LoggingDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockLogSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(context?: RenderWithContextsOptions) {
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <LoggingDetail />
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
    expect(screen.getByText('Logging Aggregator Username')).toBeInTheDocument();
  });

  test('should render one tab per group of settings', async () => {
    await renderDetail();
    ['Credentials', 'General', 'Miscellaneous', 'Protocol'].forEach((name) => {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    });
  });

  test("should render each tab's settings, and only those", async () => {
    const { user } = await renderDetail();

    assertDetail('Logging Aggregator Username', 'logging_name');
    assertDetail('Logging Aggregator Password/Token', 'Encrypted');
    expect(
      screen.queryByText('Enable External Logging')
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'General' }));
    assertDetail('Enable External Logging', 'Off');
    assertDetail('Logging Aggregator', 'https://mocklog');
    assertDetail('Logging Aggregator Type', 'logstash');

    await user.click(screen.getByRole('tab', { name: 'Miscellaneous' }));
    assertDetail('TCP Connection Timeout', '5 seconds');
    assertDetail('Logging Aggregator Level Threshold', 'INFO');
    assertDetail('Log System Tracking Facts Individually', 'Off');
    expect(
      screen.getByText('Loggers Sending Data to Log Aggregator Form')
    ).toBeInTheDocument();
    assertDetail('Log Format For API 4XX Errors', 'Test Log Line');

    await user.click(screen.getByRole('tab', { name: 'Protocol' }));
    // A choice reads as its label rather than the value stored.
    assertDetail('Logging Aggregator Protocol', 'HTTPS/HTTP');
    assertDetail('Logging Aggregator Port', '1234');
    assertDetail('Enable/disable HTTPS certificate verification', 'On');
  });

  test('should open on the tab the address names', async () => {
    // Where the edit form sends a reader back to after a save or a cancel.
    const history = createMemoryHistory({
      initialEntries: ['/logging/protocol'],
    });
    await renderDetail({ context: { router: { history } } });
    assertDetail('Logging Aggregator Protocol', 'HTTPS/HTTP');
    expect(
      screen.queryByText('Logging Aggregator Username')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/logging/edit/protocol'
    );
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
