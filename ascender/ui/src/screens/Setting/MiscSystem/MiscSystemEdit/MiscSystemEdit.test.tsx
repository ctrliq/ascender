import React from 'react';
import { screen, waitFor, within, act } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { TestUser } from '../../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockAllSettings from '../../shared/data.allSettings.json';
import MiscSystemEdit from './MiscSystemEdit';

vi.mock('../../../../api');

const mockExecutionEnvironment = [
  {
    id: 1,
    name: 'Default EE',
    description: '',
    image: 'ghcr.io/ctrliq/ascender-ee',
    url: '/api/v2/execution_environments/1/',
  },
];

const systemData = {
  ACTIVITY_STREAM_ENABLED: true,
  ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC: false,
  ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS: false,
  DEFAULT_EXECUTION_ENVIRONMENT: 1,
  MANAGE_ORGANIZATION_AUTH: true,
  ORG_ADMINS_CAN_SEE_ALL_USERS: true,
  REMOTE_HOST_HEADERS: ['REMOTE_ADDR', 'REMOTE_HOST'],
  ASCENDER_URL_BASE: 'https://localhost:3000',
  PROXY_IP_ALLOWED_LIST: [],
  CSRF_TRUSTED_ORIGINS: [],
};

describe('<MiscSystemEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAllSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: { results: mockExecutionEnvironment, count: 1 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // One tab, one page: the execution environment is the group most of these
  // are about, so it is the default.
  async function mountEdit(group = 'execution_environment') {
    history = createMemoryHistory({
      initialEntries: [`/system/edit/${group}`],
    });
    // The production read mutates the shared OPTIONS objects (sets .value), so
    // deep-clone to keep tests isolated.
    const result = renderWithContexts(
      <SettingsProvider value={JSON.parse(JSON.stringify(settingOptions))}>
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
  async function selectExecutionEnvironment(user: TestUser) {
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
    // The tab's own setting and nothing else: the rest of the category was
    // never on screen, so it is not the form's to send.
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
        DEFAULT_EXECUTION_ENVIRONMENT: 1,
      })
    );
  });

  test('should save only the settings of the tab being edited', async () => {
    const { user } = await mountEdit('users');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      ORG_ADMINS_CAN_SEE_ALL_USERS: systemData.ORG_ADMINS_CAN_SEE_ALL_USERS,
      ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS:
        systemData.ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS,
      MANAGE_ORGANIZATION_AUTH: systemData.MANAGE_ORGANIZATION_AUTH,
    });
  });

  test('should show an error rather than the form when the environment cannot be read', async () => {
    // A form opened without the environment the setting names shows the
    // field empty, and saving it would clear the setting.
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { ...mockAllSettings, DEFAULT_EXECUTION_ENVIRONMENT: 7 },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    vi.mocked(ExecutionEnvironmentsAPI.readDetail).mockRejectedValue(
      new Error()
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
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
    await user.clear(eeInput!);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1300);
      });
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
        DEFAULT_EXECUTION_ENVIRONMENT: null,
      })
    );
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
      DEFAULT_EXECUTION_ENVIRONMENT: null,
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
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
      expect(history.location.pathname).toEqual('/system/execution_environment')
    );
  });

  test('should navigate to miscellaneous detail when cancel is clicked', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/system/execution_environment');
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

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
