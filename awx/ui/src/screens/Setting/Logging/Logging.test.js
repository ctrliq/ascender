import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import Logging from './Logging';

jest.mock('../../../api/models/Settings');

describe('<Logging />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
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
        LOG_AGGREGATOR_TOWER_UUID: '',
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
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderLogging(initialEntries, context) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/logging/*" element={<Logging />} />
        </Routes>
      </SettingsProvider>,
      {
        context: {
          router: { history },
          ...context,
        },
      }
    );
  }

  test('should render logging details', async () => {
    renderLogging(['/settings/logging/details']);
    expect(
      await screen.findByText('Enable External Logging')
    ).toBeInTheDocument();
  });

  test('should render logging edit', async () => {
    renderLogging(['/settings/logging/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderLogging(['/settings/logging/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });

  test('should redirect to details for users without system admin permissions', async () => {
    renderLogging(['/settings/logging/edit'], {
      config: { me: { is_superuser: false } },
    });
    expect(
      await screen.findByText('Enable External Logging')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
