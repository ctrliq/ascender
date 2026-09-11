import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { DashboardAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import DashboardGraph from './DashboardGraph';

vi.mock('../../api');

// LineChart renders via d3, which relies on SVGPathElement.getTotalLength —
// not implemented by jsdom — so the real chart throws while drawing. The chart
// itself isn't under test here (the filter controls and the data request are),
// so stub it out and keep the assertions on the surrounding UI + API calls.
vi.mock('./shared/LineChart', () => ({
  default: () => <div data-testid="line-chart" />,
}));

function getToggle(label: Untyped) {
  return screen.getByRole('button', { name: label });
}

describe('<DashboardGraph/>', () => {
  let graphRequest: Untyped;

  beforeEach(() => {
    vi.mocked(DashboardAPI.read).mockResolvedValue(
      {} as unknown as ResponseOf<typeof DashboardAPI.read>
    );
    graphRequest = DashboardAPI.readJobGraph;
    graphRequest.mockResolvedValue({
      data: {
        jobs: {
          successful: [
            [1609459200, 2],
            [1609545600, 4],
          ],
          failed: [
            [1609459200, 1],
            [1609545600, 0],
          ],
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders month-based/all job type chart by default', async () => {
    renderWithContexts(<DashboardGraph />);
    await waitFor(() =>
      expect(graphRequest).toHaveBeenCalledWith({
        job_type: 'all',
        period: 'month',
      })
    );
  });

  test('should render all three line chart filters with correct number of options', async () => {
    const { user } = renderWithContexts(<DashboardGraph />);

    await waitFor(() => expect(graphRequest).toHaveBeenCalled());

    const periodToggle = getToggle('Past month');
    const jobTypeToggle = getToggle('All job types');
    const statusToggle = getToggle('All jobs');
    expect(periodToggle).toBeInTheDocument();
    expect(jobTypeToggle).toBeInTheDocument();
    expect(statusToggle).toBeInTheDocument();

    await user.click(jobTypeToggle);
    let listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(4);

    await user.click(jobTypeToggle);
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );

    await user.click(periodToggle);
    listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(4);

    await user.click(periodToggle);
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    );

    await user.click(statusToggle);
    listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });
});
