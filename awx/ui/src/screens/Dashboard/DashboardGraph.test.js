import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { DashboardAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import DashboardGraph from './DashboardGraph';

jest.mock('../../api');

// LineChart renders via d3, which relies on SVGPathElement.getTotalLength —
// not implemented by jsdom — so the real chart throws while drawing. The chart
// itself isn't under test here (the filter controls and the data request are),
// so stub it out and keep the assertions on the surrounding UI + API calls.
jest.mock('./shared/LineChart', () => () => <div data-testid="line-chart" />);

// The three PF Select toggles all expose the accessible name "Options menu",
// so they can't be told apart by role+name. They carry distinct classNames
// (periodSelect / jobTypeSelect / jobStatusSelect) wired up in the source, so
// scope to each select wrapper and grab its toggle button.
function getToggle(container, className) {
  return container.querySelector(`.${className} button.pf-c-select__toggle`);
}

describe('<DashboardGraph/>', () => {
  let graphRequest;

  beforeEach(() => {
    DashboardAPI.read.mockResolvedValue({});
    graphRequest = DashboardAPI.readJobGraph;
    graphRequest.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    const { user, container } = renderWithContexts(<DashboardGraph />);

    await waitFor(() => expect(graphRequest).toHaveBeenCalled());

    const periodToggle = getToggle(container, 'periodSelect');
    const jobTypeToggle = getToggle(container, 'jobTypeSelect');
    const statusToggle = getToggle(container, 'jobStatusSelect');
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
