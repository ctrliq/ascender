import React from 'react';
import { screen, waitFor, within, act } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockAllSettings from '../../shared/data.allSettings.json';
import MiscSystemEdit from './MiscSystemEdit';

jest.mock('../../../../api');

const mockExecutionEnvironment = [
  {
    id: 1,
    name: 'Default EE',
    description: '',
    image: 'quay.io/ansible/awx-ee',
    url: '/api/v2/execution_environments/1/',
  },
];

const systemData = {
  ACTIVITY_STREAM_ENABLED: true,
  ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC: false,
  DEFAULT_EXECUTION_ENVIRONMENT: 1,
  MANAGE_ORGANIZATION_AUTH: true,
  ORG_ADMINS_CAN_SEE_ALL_USERS: true,
  REMOTE_HOST_HEADERS: ['REMOTE_ADDR', 'REMOTE_HOST'],
  TOWER_URL_BASE: 'https://localhost:3000',
  PROXY_IP_ALLOWED_LIST: [],
  CSRF_TRUSTED_ORIGINS: [],
};

describe('<MiscSystemEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({ data: mockAllSettings });
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: mockExecutionEnvironment, count: 1 },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function mountEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_system/edit'],
    });
    // The production read mutates the shared OPTIONS objects (sets .value), so
    // deep-clone to keep tests isolated.
    const result = renderWithContexts(
      <SettingsProvider value={JSON.parse(JSON.stringify(mockAllOptions.actions))}>
        <MiscSystemEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  // Open the Execution Environment lookup modal, pick the mocked EE and confirm.
  async function selectExecutionEnvironment(user) {
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    const row = await within(dialog).findByText('Default EE');
    await user.click(row);
    await user.click(within(dialog).getByRole('button', { name: 'Select' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  }

  test('initially renders without crashing', async () => {
    await mountEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('save button should call updateAll', async () => {
    const { user } = await mountEdit();
    await selectExecutionEnvironment(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledWith(systemData)
    );
  });

  test('should remove execution environment', async () => {
    const { container, user } = await mountEdit();
    await selectExecutionEnvironment(user);
    const eeInput = container.querySelector(
      '#DEFAULT_EXECUTION_ENVIRONMENT-field input'
    );
    // Clearing the lookup input schedules its 1s debounce, whose empty-name
    // branch resolves the field to null (mirrors the original test's direct
    // onChange(null)). Let the debounce fire, then submit once. (Clicking Save
    // repeatedly inside a waitFor poll before the debounce resolves piles up
    // synchronous re-renders and never returns.)
    await user.clear(eeInput);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1300);
      });
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
        ...systemData,
        DEFAULT_EXECUTION_ENVIRONMENT: null,
      })
    );
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
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('system');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
  });

  test('should navigate to miscellaneous detail on successful submission', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/miscellaneous_system/details'
      )
    );
  });

  test('should navigate to miscellaneous detail when cancel is clicked', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/settings/miscellaneous_system/details'
    );
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

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
