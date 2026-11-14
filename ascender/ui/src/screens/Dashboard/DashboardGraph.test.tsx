import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MockedFunction } from 'vitest';
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

const here = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = fs.readFileSync(
  path.join(here, 'DashboardGraph.css'),
  'utf8'
);
const chartStylesheet = fs.readFileSync(
  path.join(here, 'shared', 'LineChart.css'),
  'utf8'
);

function getToggle(label: string) {
  return screen.getByRole('button', { name: label });
}

describe('<DashboardGraph/>', () => {
  let graphRequest: MockedFunction<typeof DashboardAPI.readJobGraph>;

  beforeEach(() => {
    vi.mocked(DashboardAPI.read).mockResolvedValue(
      {} as unknown as ResponseOf<typeof DashboardAPI.read>
    );
    graphRequest = vi.mocked(DashboardAPI.readJobGraph);
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
    } as unknown as ResponseOf<typeof DashboardAPI.readJobGraph>);
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

    const periodToggle = getToggle('Past Month');
    const jobTypeToggle = getToggle('All Job Types');
    const statusToggle = getToggle('All Runs');
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
    // Named for runs, as the Runs list and the Recent Runs tab are.
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['All Runs', 'Successful Runs', 'Failed Runs']);
  });
  /*
   * The filters are one row of controls between the tab bar and the chart, and
   * PatternFly's card header padding stood them twice as far off both. The
   * selector is doubled because that padding is set on PatternFly's own class,
   * which a bare class ties with and loses to on file order: the doubling is
   * the fix, so it is what this holds on to. jsdom applies no stylesheet, so
   * the file is what a test here can read.
   */
  test('should keep the filter row close to the tabs and the chart', () => {
    const rule = stylesheet
      .split('}')
      .find((block) =>
        block
          .split('{')[0]
          ?.includes(
            '.ascender-dashboard-graph__card-header.ascender-dashboard-graph__card-header'
          )
      );
    expect(rule).toMatch(
      /padding-block:\s*var\(--pf-t--global--spacer--md\) var\(--pf-t--global--spacer--sm\);/
    );
  });

  /*
   * The chart's own margin is the other half of that gap: three rems stood it
   * so far under the filters that they read as a band of their own rather than
   * the controls for the chart below. It is a class rather than the inline
   * style it used to be, so that this can read it.
   */
  test('should hang the chart close under the filter row', () => {
    expect(chartStylesheet).toMatch(
      /\.ascender-line-chart\s*{[^}]*margin-top:\s*1rem;/
    );
  });

  /*
   * And the foot of the card: the chart ends in its own axis label, so the
   * card's full padding under it read as a band of empty card rather than the
   * end of the chart.
   */
  test('should close the card up under the axis label', () => {
    const rule = stylesheet
      .split('}')
      .find((block) =>
        block
          .split('{')[0]
          ?.includes(
            '.ascender-dashboard-graph__card-body.ascender-dashboard-graph__card-body'
          )
      );
    expect(rule).toMatch(/padding-block-end:\s*14px;/);
  });
});
