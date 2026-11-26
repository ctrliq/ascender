import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockJobSettings from '../../shared/data.jobSettings.json';
import JobsEdit from './JobsEdit';

vi.mock('../../../../api');

describe('<JobsEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockJobSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function mountEdit(options = settingOptions) {
    history = createMemoryHistory({
      initialEntries: ['/job_settings/edit'],
    });
    // The mock OPTIONS data omits config for a few BooleanFields (e.g.
    // ENABLE_ANSIBLE_29), so the production form logs a PropTypes warning on
    // mount; suppress it so the setupTests console trap doesn't fail the test.
    const originalError = console.error;
    console.error = vi.fn();
    try {
      const result = renderWithContexts(
        <SettingsProvider value={options}>
          <JobsEdit />
        </SettingsProvider>,
        { context: { router: { history } } }
      );
      await waitFor(() =>
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      );
      return result;
    } finally {
      console.error = originalError;
    }
  }

  test('initially renders without crashing', async () => {
    await mountEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await mountEdit();
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
      ASCENDER_ROLES_ENABLED: true,
      ASCENDER_COLLECTIONS_ENABLED: true,
      GALAXY_IGNORE_CERTS: false,
      GALAXY_TASK_ENV: {
        ANSIBLE_FORCE_COLOR: 'false',
        GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no',
      },
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await mountEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // The tab's own settings, which are the ones the form was showing: the
    // rest of the category is left as it was.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      ASCENDER_ROLES_ENABLED: mockJobSettings.ASCENDER_ROLES_ENABLED,
      ASCENDER_COLLECTIONS_ENABLED:
        mockJobSettings.ASCENDER_COLLECTIONS_ENABLED,
      GALAXY_IGNORE_CERTS: mockJobSettings.GALAXY_IGNORE_CERTS,
      GALAXY_TASK_ENV: mockJobSettings.GALAXY_TASK_ENV,
    });
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
    const { user } = await mountEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should navigate to job settings detail when cancel is clicked', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // Back to the tab it was editing, not to the top of the screen.
    expect(history.location.pathname).toEqual('/job_settings/content');
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });

  test('Form input fields that are invisible (due to being set manually via a settings file) should not prevent submitting the form', async () => {
    const mockOptions = {
      GET: { ...settingOptions.GET },
      PUT: { ...settingOptions.PUT },
    };
    // If ASCENDER_ISOLATION_BASE_PATH has been set in a settings file it will be
    // absent in the PUT options
    delete (mockOptions.PUT as Record<string, unknown>)
      .ASCENDER_ISOLATION_BASE_PATH;
    const { user } = await mountEdit(mockOptions);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
  });
});
