import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import LoggingEdit from './LoggingEdit';

vi.mock('../../../../api');

const mockSettings = {
  LOG_AGGREGATOR_HOST: 'https://logstash',
  LOG_AGGREGATOR_PORT: 1234,
  LOG_AGGREGATOR_TYPE: 'logstash',
  LOG_AGGREGATOR_USERNAME: '',
  LOG_AGGREGATOR_PASSWORD: '',
  LOG_AGGREGATOR_LOGGERS: [
    'awx',
    'activity_stream',
    'job_events',
    'system_tracking',
  ],
  LOG_AGGREGATOR_INDIVIDUAL_FACTS: false,
  LOG_AGGREGATOR_ENABLED: true,
  LOG_AGGREGATOR_ASCENDER_UUID: '',
  LOG_AGGREGATOR_PROTOCOL: 'https',
  LOG_AGGREGATOR_TCP_TIMEOUT: 123,
  LOG_AGGREGATOR_VERIFY_CERT: true,
  LOG_AGGREGATOR_LEVEL: 'ERROR',
  LOG_AGGREGATOR_ACTION_QUEUE_SIZE: 131072,
  LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB: 1,
  LOG_AGGREGATOR_MAX_DISK_USAGE_PATH: '/var/lib/awx',
  LOG_AGGREGATOR_RSYSLOGD_DEBUG: false,
  API_400_ERROR_LOG_FORMAT:
    'status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}',
};

describe('<LoggingEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Each tab is its own page, so a test names the group it is editing. The
  // overrides are for the fields one tab renders conditionally on a setting
  // that belongs to another: the protocol decides whether the TCP timeout on
  // Miscellaneous is there at all.
  async function renderEdit(
    group = 'general',
    overrides: Record<string, unknown> = {}
  ) {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { ...mockSettings, ...overrides },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    history = createMemoryHistory({
      initialEntries: [`/logging/edit/${group}`],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <LoggingEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  // FormGroup label -> the FormGroup wrapper element, used to scope assertions
  // about the required marker to a single field.
  function getFormGroup(container: HTMLElement, label: string) {
    const labelEl = screen.queryByText(label);
    if (!labelEl) {
      return null;
    }
    return labelEl.closest('.pf-v6-c-form__group');
  }

  test('initially renders without crashing', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('Enable External Logging toggle should be disabled when it is off and there is no Logging Aggregator or no Logging Aggregator Type', async () => {
    const { container } = await renderEdit();
    const enableSwitch = container.querySelector(
      '#LOG_AGGREGATOR_ENABLED'
    ) as HTMLInputElement;
    expect(enableSwitch.checked).toBe(true);
    expect(enableSwitch.disabled).toBe(false);
    // Toggle external logging off.
    fireEvent.click(enableSwitch);
    // Clear the Logging Aggregator host input.
    const hostInput = container.querySelector(
      '#LOG_AGGREGATOR_HOST'
    ) as HTMLInputElement;
    fireEvent.change(hostInput, {
      target: { name: 'LOG_AGGREGATOR_HOST', value: '' },
    });
    await waitFor(() => {
      const toggled = container.querySelector(
        '#LOG_AGGREGATOR_ENABLED'
      ) as HTMLInputElement;
      expect(toggled.checked).toBe(false);
      expect(toggled.disabled).toBe(true);
    });
  });

  test('Logging Aggregator and Logging Aggregator Type should be required when External Logging toggle is enabled', async () => {
    const { container } = await renderEdit();
    const aggregatorGroup = getFormGroup(container, 'Logging Aggregator');
    const aggregatorTypeGroup = getFormGroup(
      container,
      'Logging Aggregator Type'
    );
    expect(
      aggregatorGroup!.querySelectorAll('.pf-v6-c-form__label-required')
    ).toHaveLength(1);
    expect(
      aggregatorTypeGroup!.querySelectorAll('.pf-v6-c-form__label-required')
    ).toHaveLength(1);
  });

  test('Logging Aggregator and Logging Aggregator Type should not be required when External Logging toggle is disabled', async () => {
    const { container } = await renderEdit();
    fireEvent.click(container.querySelector('#LOG_AGGREGATOR_ENABLED')!);
    await waitFor(() =>
      expect(
        (
          container.querySelector(
            '#LOG_AGGREGATOR_ENABLED'
          )! as HTMLInputElement
        ).checked
      ).toBe(false)
    );
    const aggregatorGroup = getFormGroup(container, 'Logging Aggregator');
    const aggregatorTypeGroup = getFormGroup(
      container,
      'Logging Aggregator Type'
    );
    expect(
      aggregatorGroup!.querySelectorAll('.pf-v6-c-form__label-required')
    ).toHaveLength(0);
    expect(
      aggregatorTypeGroup!.querySelectorAll('.pf-v6-c-form__label-required')
    ).toHaveLength(0);
  });

  test('HTTPS certificate toggle should be shown when protocol is https', async () => {
    const { container } = await renderEdit('protocol');
    expect(
      screen.getByText('Enable/disable HTTPS certificate verification')
    ).toBeInTheDocument();
    expect(
      (
        container.querySelector(
          '#LOG_AGGREGATOR_VERIFY_CERT'
        )! as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  test('TCP connection timeout should be required when protocol is tcp', async () => {
    const { container } = await renderEdit('misc', {
      LOG_AGGREGATOR_PROTOCOL: 'tcp',
    });
    expect(screen.getByText('TCP Connection Timeout')).toBeInTheDocument();
    const tcpGroup = getFormGroup(container, 'TCP Connection Timeout');
    expect(
      tcpGroup!.querySelectorAll('.pf-v6-c-form__label-required')
    ).toHaveLength(1);
  });

  test('TCP connection timeout should be hidden when protocol is udp', async () => {
    await renderEdit('misc', { LOG_AGGREGATOR_PROTOCOL: 'udp' });
    expect(
      screen.queryByText('TCP Connection Timeout')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Logging Aggregator Level Threshold')
    ).toBeInTheDocument();
  });

  test('https certificate toggle should be hidden when protocol is udp', async () => {
    const { container } = await renderEdit('protocol');
    fireEvent.change(container.querySelector('#LOG_AGGREGATOR_PROTOCOL')!, {
      target: { name: 'LOG_AGGREGATOR_PROTOCOL', value: 'udp' },
    });
    await waitFor(() =>
      expect(
        screen.queryByText('Enable/disable HTTPS certificate verification')
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText('Logging Aggregator Port')).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert Settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert All to Default' })
    );
    expect(await screen.findByText('Revert Settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // Only the settings this page shows, each at its default: a DELETE on
    // the category would reset what the page does not show as well.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      LOG_AGGREGATOR_ENABLED: false,
      LOG_AGGREGATOR_HOST: null,
      LOG_AGGREGATOR_TYPE: null,
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit('protocol');
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    const portInput = container.querySelector(
      '#LOG_AGGREGATOR_PORT'
    ) as HTMLInputElement;
    await user.clear(portInput);
    await user.type(portInput, '1010');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // The protocol tab's own three settings and nothing else.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      LOG_AGGREGATOR_PROTOCOL: 'https',
      LOG_AGGREGATOR_PORT: 1010,
      LOG_AGGREGATOR_VERIFY_CERT: true,
    });
  });

  test('should not send the aggregator password from another tab', async () => {
    // A save of the general tab once carried the whole category, the stored
    // password among it.
    const { user } = await renderEdit('general', {
      LOG_AGGREGATOR_PASSWORD: '$encrypted$',
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      LOG_AGGREGATOR_ENABLED: true,
      LOG_AGGREGATOR_HOST: 'https://logstash',
      LOG_AGGREGATOR_TYPE: 'logstash',
    });
  });

  test('should navigate to logging detail on successful submission', async () => {
    const { user } = await renderEdit('protocol');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Back on the tab that was edited rather than the first one.
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/logging/protocol')
    );
  });

  test('should navigate to logging detail when cancel is clicked', async () => {
    const { user } = await renderEdit('protocol');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/logging/protocol');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(SettingsAPI.updateAll).mockImplementation(() =>
      Promise.reject(error)
    );
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await renderEdit();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
