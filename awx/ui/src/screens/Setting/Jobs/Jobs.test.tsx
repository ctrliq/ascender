import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../testUtils/settingOptions';
import mockJobSettings from '../shared/data.jobSettings.json';
import Jobs from './Jobs';

vi.mock('../../../api');

function mountAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <SettingsProvider value={settingOptions}>
      <Routes>
        <Route path="/settings/jobs/*" element={<Jobs />} />
      </Routes>
    </SettingsProvider>,
    { context: { router: { history } } }
  );
}

describe('<Jobs />', () => {
  beforeEach(() => {
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockJobSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render jobs details', async () => {
    mountAt('/settings/jobs/details');
    expect(await screen.findByText('Details')).toBeInTheDocument();
    await waitFor(() =>
      expect(SettingsAPI.readCategory).toHaveBeenCalledWith('jobs')
    );
  });

  test('should render jobs edit', async () => {
    // JobsEdit logs a PropTypes warning for BooleanFields whose config is
    // absent from the mock OPTIONS data; suppress it so the console trap
    // doesn't fail this render-only assertion.
    const originalError = console.error;
    console.error = vi.fn();
    try {
      mountAt('/settings/jobs/edit');
      expect(
        await screen.findByRole('button', { name: 'Save' })
      ).toBeInTheDocument();
    } finally {
      console.error = originalError;
    }
  });

  test('should show content error when user navigates to erroneous route', async () => {
    mountAt('/settings/jobs/foo');
    expect(await screen.findByText('View Jobs settings')).toBeInTheDocument();
  });
});
