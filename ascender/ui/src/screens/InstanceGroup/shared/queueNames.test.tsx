import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import {
  DEFAULT_QUEUE_NAMES,
  queueNamesFrom,
  useQueueNames,
} from './queueNames';

vi.mock('../../../api');

/** Prints what the hook returns, so a test reads it off the screen. */
function Names() {
  const { controlPlane, execution } = useQueueNames();
  return <div>{`${controlPlane}/${execution}`}</div>;
}

describe('queueNamesFrom', () => {
  test('takes the names the settings give', () => {
    expect(
      queueNamesFrom({
        DEFAULT_CONTROL_PLANE_QUEUE_NAME: 'cp',
        DEFAULT_EXECUTION_QUEUE_NAME: 'jobs',
      })
    ).toEqual({ controlPlane: 'cp', execution: 'jobs' });
  });

  test.each([
    [null],
    [undefined],
    [{}],
    [{ DEFAULT_EXECUTION_QUEUE_NAME: '' }],
  ])('falls back to the defaults where %j holds no name', (settings) => {
    expect(queueNamesFrom(settings)).toEqual(DEFAULT_QUEUE_NAMES);
  });
});

describe('useQueueNames', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('reads the names for a superuser', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        DEFAULT_CONTROL_PLANE_QUEUE_NAME: 'cp',
        DEFAULT_EXECUTION_QUEUE_NAME: 'jobs',
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    renderWithContexts(<Names />, {
      context: { config: { me: { is_superuser: true } } },
    });
    expect(await screen.findByText('cp/jobs')).toBeInTheDocument();
    expect(SettingsAPI.readCategory).toHaveBeenCalledWith('system');
  });

  test('keeps the defaults when the read fails', async () => {
    vi.mocked(SettingsAPI.readCategory).mockRejectedValue(new Error('nope'));
    renderWithContexts(<Names />, {
      context: { config: { me: { is_superuser: true } } },
    });
    await waitFor(() => expect(SettingsAPI.readCategory).toHaveBeenCalled());
    expect(screen.getByText('controlplane/default')).toBeInTheDocument();
  });

  test('asks nothing of the api for a viewer who may not read settings', async () => {
    renderWithContexts(<Names />, {
      context: { config: { me: { is_superuser: false } } },
    });
    expect(await screen.findByText('controlplane/default')).toBeInTheDocument();
    expect(SettingsAPI.readCategory).not.toHaveBeenCalled();
  });
});
