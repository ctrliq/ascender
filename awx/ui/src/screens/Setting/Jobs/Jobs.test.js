import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import mockJobSettings from '../shared/data.jobSettings.json';
import Jobs from './Jobs';

jest.mock('../../../api');

function mountAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <SettingsProvider value={mockAllOptions.actions}>
      <Routes>
        <Route path="/settings/jobs/*" element={<Jobs />} />
      </Routes>
    </SettingsProvider>,
    { context: { router: { history } } }
  );
}

describe('<Jobs />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockJobSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    console.error = jest.fn();
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
