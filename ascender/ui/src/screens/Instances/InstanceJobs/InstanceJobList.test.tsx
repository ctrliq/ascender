import React from 'react';
import { Routes, Route } from 'react-router';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstancesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceJobList from './InstanceJobList';

vi.mock('../../../api');

// The shared run list is exercised on its own; here it only has to be given
// the instance's filter and no run control.
const jobListProps = vi.fn();
vi.mock('components/JobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      jobListProps(props);
      return ReactLib.createElement('div', null, 'JobList');
    },
  };
});

describe('<InstanceJobList />', () => {
  test('lists the runs the instance executed', async () => {
    vi.mocked(InstancesAPI.readDetail).mockResolvedValue({
      data: { id: 7, hostname: 'node-1' },
    } as unknown as ResponseOf<typeof InstancesAPI.readDetail>);
    const setBreadcrumb = vi.fn();
    const history = createMemoryHistory({
      initialEntries: ['/instances/7/runs'],
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/instances/:id/runs"
          element={<InstanceJobList setBreadcrumb={setBreadcrumb} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );

    expect(await screen.findByText('JobList')).toBeInTheDocument();
    expect(InstancesAPI.readDetail).toHaveBeenCalledWith('7');
    expect(jobListProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultParams: { execution_node: 'node-1' },
        runControl: false,
        showTypeColumn: true,
      })
    );
    expect(setBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'node-1' })
    );
  });
});
