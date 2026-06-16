import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockJobSettings from '../../shared/data.jobSettings.json';
import JobsEdit from './JobsEdit';

jest.mock('../../../../api');

describe('<JobsEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockJobSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function mountEdit(options = mockAllOptions.actions) {
    history = createMemoryHistory({
      initialEntries: ['/settings/jobs/edit'],
    });
    // The mock OPTIONS data omits config for a few BooleanFields (e.g.
    // ENABLE_ANSIBLE_29), so the production form logs a PropTypes warning on
    // mount; suppress it so the setupTests console trap doesn't fail the test.
    const originalError = console.error;
    console.error = jest.fn();
    const result = renderWithContexts(
      <SettingsProvider value={options}>
        <JobsEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    console.error = originalError;
    return result;
  }

  test('initially renders without crashing', async () => {
    await mountEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await mountEdit();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm revert all' }));
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('jobs');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await mountEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    const {
      EVENT_STDOUT_MAX_BYTES_DISPLAY,
      STDOUT_MAX_BYTES_DISPLAY,
      ...jobRequest
    } = mockJobSettings;
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith(jobRequest);
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user } = await mountEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should navigate to job settings detail when cancel is clicked', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/jobs/details');
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });

  test('Form input fields that are invisible (due to being set manually via a settings file) should not prevent submitting the form', async () => {
    const mockOptions = {
      GET: { ...mockAllOptions.actions.GET },
      PUT: { ...mockAllOptions.actions.PUT },
    };
    // If AWX_ISOLATION_BASE_PATH has been set in a settings file it will be
    // absent in the PUT options
    delete mockOptions.PUT.AWX_ISOLATION_BASE_PATH;
    const { user } = await mountEdit(mockOptions);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
  });
});
