import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import mockAllSettings from '../shared/data.allSettings.json';
import MiscSystem from './MiscSystem';

vi.mock('../../../api');

function mountAt(path: Untyped, config?: Untyped) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const context: Untyped = { router: { history } };
  if (config) {
    context.config = config;
  }
  return renderWithContexts(
    <SettingsProvider value={JSON.parse(JSON.stringify(settingOptions))}>
      <Routes>
        <Route
          path="/settings/miscellaneous_system/*"
          element={<MiscSystem />}
        />
      </Routes>
    </SettingsProvider>,
    { context }
  );
}

describe('<MiscSystem />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAllSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render miscellaneous system details', async () => {
    mountAt('/settings/miscellaneous_system/details');
    expect(await screen.findByText('Details')).toBeInTheDocument();
    await waitFor(() =>
      expect(SettingsAPI.readCategory).toHaveBeenCalledWith('system')
    );
  });

  test('should render miscellaneous system edit', async () => {
    mountAt('/settings/miscellaneous_system/edit');
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    mountAt('/settings/miscellaneous_system/foo');
    expect(
      await screen.findByText('View Miscellaneous System settings')
    ).toBeInTheDocument();
  });

  test('should redirect to details for users without system admin permissions', async () => {
    mountAt('/settings/miscellaneous_system/edit', {
      me: { is_superuser: false },
    });
    // Non-superusers are redirected from edit to the read-only Details tab, so
    // the Save button never renders.
    expect(await screen.findByText('Details')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' })
    ).not.toBeInTheDocument();
  });
});
