import type { OptionsField } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import type { TestContexts } from '../../../../../testUtils/rtlContexts';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import MiscSystemDetail from './MiscSystemDetail';

vi.mock('../../../../api');

// A variable detail is asserted by its surrounding label: what each editor
// holds is covered by the VariablesDetail tests rather than repeated here.
function assertVariableDetail(label: string) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

function freshSystemData() {
  return {
    ACTIVITY_STREAM_ENABLED: true,
    ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC: false,
    ORG_ADMINS_CAN_SEE_ALL_USERS: true,
    MANAGE_ORGANIZATION_AUTH: true,
    ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS: false,
    ASCENDER_URL_BASE: 'https://towerhost',
    REMOTE_HOST_HEADERS: [],
    PROXY_IP_ALLOWED_LIST: [],
    CSRF_TRUSTED_ORIGINS: [],
    INSTALL_UUID: 'db39b9ec-0c6e-4554-987d-42aw9c732ed8',
    DEFAULT_EXECUTION_ENVIRONMENT: 1,
  };
}

describe('<MiscSystemDetail />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: freshSystemData(),
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    vi.mocked(ExecutionEnvironmentsAPI.readDetail).mockResolvedValue({
      data: {
        id: 1,
        name: 'Foo',
        image: 'ghcr.io/ctrliq/ascender-ee',
        pull: 'missing',
      },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function mountDetail(
    options: typeof settingOptions = settingOptions,
    context: TestContexts | undefined = undefined
  ) {
    // Each group of settings is an address, so the screen is mounted on one
    // and a tab click is a navigation like any other.
    const history = createMemoryHistory({
      initialEntries: ['/system/activity_stream'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={options}>
        <Routes>
          <Route path="/system/:group" element={<MiscSystemDetail />} />
        </Routes>
      </SettingsProvider>,
      {
        ...(context ?? {}),
        context: { ...(context ?? {}), router: { history } },
      } as Parameters<typeof renderWithContexts>[1]
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await mountDetail();
    expect(screen.getByText('Enable Activity Stream')).toBeInTheDocument();
  });

  test('should render one tab per group of settings', async () => {
    await mountDetail();
    [
      'Activity Stream',
      'Execution Environment',
      'Miscellaneous',
      'Security',
      'Users',
    ].forEach((name) => {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    });
  });

  test("should render each tab's settings, and only those", async () => {
    const { user } = await mountDetail();

    assertDetail('Enable Activity Stream', 'On');
    assertDetail('Enable Activity Stream for Inventory Sync', 'Off');
    expect(
      screen.queryByText('Base URL of the service')
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('tab', { name: 'Execution Environment' })
    );
    assertDetail('Global default execution environment', 'Foo');

    await user.click(screen.getByRole('tab', { name: 'Miscellaneous' }));
    assertDetail('Base URL of the service', 'https://towerhost');
    assertDetail(
      'Unique identifier for an installation',
      'db39b9ec-0c6e-4554-987d-42aw9c732ed8'
    );

    await user.click(screen.getByRole('tab', { name: 'Security' }));
    assertVariableDetail('Remote Host Headers');
    assertVariableDetail('Proxy IP Allowed List');

    await user.click(screen.getByRole('tab', { name: 'Users' }));
    assertDetail('All Users Visible to Organization Admins', 'On');
    // Editable on this tab, so shown on it too.
    assertDetail('Hide System Roles from Access Lists', 'Off');
    assertDetail('Organization Admins Can Manage Users and Teams', 'On');
  });

  test('should render execution environment as not configured', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { ...freshSystemData(), DEFAULT_EXECUTION_ENVIRONMENT: null },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    const { user } = await mountDetail({
      ...settingOptions,
      // Null on purpose: the detail reads this as not configured.
      DEFAULT_EXECUTION_ENVIRONMENT: null as unknown as Record<
        string,
        OptionsField
      >,
    });
    await user.click(
      screen.getByRole('tab', { name: 'Execution Environment' })
    );
    assertDetail('Global default execution environment', 'Not configured');
  });

  test('should hide edit button from non-superusers', async () => {
    await mountDetail(settingOptions, {
      config: { me: { is_superuser: false } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    vi.mocked(SettingsAPI.readCategory).mockRejectedValue(new Error());
    await mountDetail();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
