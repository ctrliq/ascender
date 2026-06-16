import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockLogSettings from '../../shared/data.logSettings.json';
import LoggingDetail from './LoggingDetail';

jest.mock('../../../../api');

describe('<LoggingDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockLogSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
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
    expect(screen.getByText('Enable External Logging')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    expect(screen.getByText('Back to Settings')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail('Enable External Logging', 'Off');
    assertDetail('Logging Aggregator', 'https://mocklog');
    assertDetail('Logging Aggregator Port', '1234');
    assertDetail('Logging Aggregator Type', 'logstash');
    assertDetail('Logging Aggregator Username', 'logging_name');
    assertDetail('Logging Aggregator Password/Token', 'Encrypted');
    assertDetail('Log System Tracking Facts Individually', 'Off');
    assertDetail('Logging Aggregator Protocol', 'https');
    assertDetail('TCP Connection Timeout', '5 seconds');
    assertDetail('Logging Aggregator Level Threshold', 'INFO');
    assertDetail('Log Format For API 4XX Errors', 'Test Log Line');
    assertDetail('Enable/disable HTTPS certificate verification', 'On');
    // CodeEditor (list type) renders empty under jsdom; assert the label.
    expect(
      screen.getByText('Loggers Sending Data to Log Aggregator Form')
    ).toBeInTheDocument();
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
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
