import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import MiscSystemDetail from './MiscSystemDetail';

vi.mock('../../../../api');

// CodeEditor (react-ace) renders empty under jsdom, so for variable details we
// assert the surrounding label is present rather than the editor contents.
function assertVariableDetail(label: Untyped) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

function freshSystemData() {
  return {
    ACTIVITY_STREAM_ENABLED: true,
    ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC: false,
    ORG_ADMINS_CAN_SEE_ALL_USERS: true,
    MANAGE_ORGANIZATION_AUTH: true,
    TOWER_URL_BASE: 'https://towerhost',
    REMOTE_HOST_HEADERS: [],
    PROXY_IP_ALLOWED_LIST: [],
    CSRF_TRUSTED_ORIGINS: [],
    LICENSE: null,
    INSTALL_UUID: 'db39b9ec-0c6e-4554-987d-42aw9c732ed8',
    DEFAULT_EXECUTION_ENVIRONMENT: 1,
    AUTOMATION_ANALYTICS_LAST_ENTRIES: '{"foo": "2021-11-24R06:35:15.179Z"}',
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
        image: 'quay.io/ansible/awx-ee',
        pull: 'missing',
      },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function mountDetail(
    options: Untyped = settingOptions,
    context: Untyped = undefined
  ) {
    renderWithContexts(
      <SettingsProvider value={options}>
        <MiscSystemDetail />
      </SettingsProvider>,
      context ? { context } : undefined
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  }

  test('initially renders without crashing', async () => {
    await mountDetail();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await mountDetail();
    const expectedTabs = ['Back to Settings', 'Details'];
    screen.getAllByRole('tab').forEach((tab, index) => {
      expect(tab).toHaveTextContent(expectedTabs[index]!);
    });
  });

  test('should render expected details', async () => {
    await mountDetail();
    assertDetail(
      'Unique identifier for an installation',
      'db39b9ec-0c6e-4554-987d-42aw9c732ed8'
    );
    assertDetail('All Users Visible to Organization Admins', 'On');
    assertDetail('Base URL of the service', 'https://towerhost');
    assertDetail('Organization Admins Can Manage Users and Teams', 'On');
    assertDetail('Enable Activity Stream', 'On');
    assertDetail('Enable Activity Stream for Inventory Sync', 'Off');
    assertVariableDetail('Remote Host Headers');
    assertVariableDetail('Proxy IP Allowed List');
    assertDetail('Global default execution environment', 'Foo');
  });

  test('should render execution environment as not configured', async () => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: { ...freshSystemData(), DEFAULT_EXECUTION_ENVIRONMENT: null },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    await mountDetail({
      ...settingOptions,
      DEFAULT_EXECUTION_ENVIRONMENT: null,
    });
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
