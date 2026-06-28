import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';

import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ManagementJobs from './ManagementJobs';

// stub the list so the /management_jobs route resolves without hitting the API
jest.mock('./ManagementJobList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ManagementJobList'),
  };
});

describe('<ManagementJobs />', () => {
  test('renders the list at /management_jobs', () => {
    const history = createMemoryHistory({
      initialEntries: ['/management_jobs'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/management_jobs/*" element={<ManagementJobs />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );

    expect(screen.getByText('Management jobs')).toBeInTheDocument();
    expect(screen.getByText('ManagementJobList')).toBeInTheDocument();
  });
});
