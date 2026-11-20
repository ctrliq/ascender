import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';

import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ManagementJobs from './ManagementJobs';

// stub the list so the /cleanup_jobs route resolves without hitting the API
vi.mock('./ManagementJobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ManagementJobList'),
  };
});

describe('<ManagementJobs />', () => {
  test('renders the list at /cleanup_jobs', () => {
    const history = createMemoryHistory({
      initialEntries: ['/cleanup_jobs'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/cleanup_jobs/*" element={<ManagementJobs />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );

    expect(screen.getByText('Cleanup Jobs')).toBeInTheDocument();
    expect(screen.getByText('ManagementJobList')).toBeInTheDocument();
  });
});
