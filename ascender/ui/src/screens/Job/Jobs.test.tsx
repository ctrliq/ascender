import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Jobs from './Jobs';

vi.mock('../../api');

// Replace the routed children with markers so the assertions are purely about
// which branch of the v6 <Routes> tree resolves for a given URL.
vi.mock('components/JobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'JobList'),
  };
});
vi.mock('./Job', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'Job detail'),
  };
});
vi.mock('./JobTypeRedirect', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    // Mirror the real component's default of view='output' so the bare
    // /runs/:id route resolves to the output view in the test too.
    default: ({ view = 'output' }) =>
      ReactLib.createElement('div', null, `JobTypeRedirect:${view}`),
  };
});

function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/runs/*" element={<Jobs />} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Jobs />', () => {
  test('renders the list at /runs', async () => {
    renderAt('/runs');
    expect(await screen.findByText('JobList')).toBeInTheDocument();
  });

  test('renders the typed detail subtree at /runs/:typeSegment/:id', async () => {
    renderAt('/runs/playbook/5/output');
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
    expect(screen.queryByText('JobList')).not.toBeInTheDocument();
  });

  test('routes an untyped /runs/:id to the type redirect defaulting to output', async () => {
    renderAt('/runs/5');
    // the bare route renders <JobTypeRedirect /> with no explicit view, which
    // defaults to 'output'
    expect(
      await screen.findByText('JobTypeRedirect:output')
    ).toBeInTheDocument();
    expect(screen.queryByText('JobList')).not.toBeInTheDocument();
  });

  test('routes an untyped /runs/:id/details to the details type redirect', async () => {
    renderAt('/runs/5/details');
    expect(
      await screen.findByText('JobTypeRedirect:details')
    ).toBeInTheDocument();
  });

  test('redirects legacy /runs/system/:id to /runs/management/:id', async () => {
    const { history } = renderAt('/runs/system/5');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/runs/management/5')
    );
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
  });

  test('preserves the trailing sub-path when redirecting /runs/system/:id/*', async () => {
    const { history } = renderAt('/runs/system/5/output');
    await waitFor(() =>
      expect(history.location.pathname).toBe('/runs/management/5/output')
    );
    expect(await screen.findByText('Job detail')).toBeInTheDocument();
  });
});
