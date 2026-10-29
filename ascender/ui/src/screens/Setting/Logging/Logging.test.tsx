import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { TestContexts } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import Logging from './Logging';

vi.mock('../../../api/models/Settings');

describe('<Logging />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        LOG_AGGREGATOR_HOST: null,
        LOG_AGGREGATOR_PORT: null,
        LOG_AGGREGATOR_TYPE: null,
        LOG_AGGREGATOR_USERNAME: '',
        LOG_AGGREGATOR_PASSWORD: '',
        LOG_AGGREGATOR_LOGGERS: [
          'awx',
          'activity_stream',
          'job_events',
          'system_tracking',
        ],
        LOG_AGGREGATOR_INDIVIDUAL_FACTS: false,
        LOG_AGGREGATOR_ENABLED: false,
        LOG_AGGREGATOR_ASCENDER_UUID: '',
        LOG_AGGREGATOR_PROTOCOL: 'https',
        LOG_AGGREGATOR_TCP_TIMEOUT: 5,
        LOG_AGGREGATOR_VERIFY_CERT: true,
        LOG_AGGREGATOR_LEVEL: 'INFO',
        LOG_AGGREGATOR_ACTION_QUEUE_SIZE: 131072,
        LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB: 1,
        LOG_AGGREGATOR_MAX_DISK_USAGE_PATH: '/var/lib/awx',
        LOG_AGGREGATOR_RSYSLOGD_DEBUG: false,
        API_400_ERROR_LOG_FORMAT:
          'status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderLogging(initialEntries: string[], context?: TestContexts) {
    const history = createMemoryHistory({ initialEntries });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <Routes>
          <Route path="/logging/*" element={<Logging />} />
        </Routes>
      </SettingsProvider>,
      {
        context: {
          router: { history },
          ...context,
        },
      }
    );
    return { ...result, history };
  }

  test('should render logging details', async () => {
    renderLogging(['/logging']);
    expect(
      await screen.findByText('Logging Aggregator Username')
    ).toBeInTheDocument();
  });

  test('should open the page on its first tab', async () => {
    const { history } = renderLogging(['/logging']);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/logging/credentials')
    );
  });

  test('should send an old ?tab= link to the tab it names', async () => {
    // The tab once lived in the query, and links to those addresses are
    // still about.
    const { history } = renderLogging(['/logging?tab=protocol']);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/logging/protocol')
    );
    expect(
      await screen.findByText('Logging Aggregator Protocol')
    ).toBeInTheDocument();
  });

  test('should render the edit form of a group', async () => {
    renderLogging(['/logging/edit/general']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderLogging(['/logging/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should redirect to details for users without system admin permissions', async () => {
    renderLogging(['/logging/edit/general'], {
      config: { me: { is_superuser: false } },
    });
    expect(
      await screen.findByText('Logging Aggregator Username')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
