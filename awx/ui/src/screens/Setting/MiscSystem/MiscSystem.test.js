import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI, ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import mockAllSettings from '../shared/data.allSettings.json';
import MiscSystem from './MiscSystem';

jest.mock('../../../api');

function mountAt(path, config) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const context = { router: { history } };
  if (config) {
    context.config = config;
  }
  return renderWithContexts(
    <SettingsProvider value={JSON.parse(JSON.stringify(mockAllOptions.actions))}>
      <Routes>
        <Route path="/settings/miscellaneous_system/*" element={<MiscSystem />} />
      </Routes>
    </SettingsProvider>,
    { context }
  );
}

describe('<MiscSystem />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({ data: mockAllSettings });
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
