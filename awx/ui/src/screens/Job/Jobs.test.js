import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Jobs from './Jobs';

jest.mock('../../api');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
jest.mock('components/JobList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'JobList'),
  };
});
jest.mock('./Job', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Job detail'),
  };
});
jest.mock('./JobTypeRedirect', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    // Mirror the real component's default of view='output' so the bare
    // /jobs/:id route resolves to the output view in the test too.
    default: ({ view = 'output' }) =>
      ReactLib.createElement('div', null, `JobTypeRedirect:${view}`),
  };
});

function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/jobs/*" element={<Jobs />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Jobs />', () => {
  test('renders the list at /jobs', async () => {
    renderAt('/jobs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('renders the typed detail subtree at /jobs/:typeSegment/:id', async () => {
    renderAt('/jobs/playbook/5/output');
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
    expect(screen.queryByText('JobList')).not.toBeInTheDocument();
  });

  test('routes an untyped /jobs/:id to the type redirect defaulting to output', async () => {
    renderAt('/jobs/5');
    // the bare route renders <JobTypeRedirect /> with no explicit view, which
    // defaults to 'output'
    expect(
      await screen.findByText('JobTypeRedirect:output')
    ).toBeInTheDocument();
    expect(screen.queryByText('JobList')).not.toBeInTheDocument();
  });

  test('routes an untyped /jobs/:id/details to the details type redirect', async () => {
    renderAt('/jobs/5/details');
    expect(
      await screen.findByText('JobTypeRedirect:details')
    ).toBeInTheDocument();
  });

  test('redirects legacy /jobs/system/:id to /jobs/management/:id', async () => {
    const { history } = renderAt('/jobs/system/5');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/management/5')
    );
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
  });

  test('preserves the trailing sub-path when redirecting /jobs/system/:id/*', async () => {
    const { history } = renderAt('/jobs/system/5/output');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/management/5/output')
    );
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
  });
});
