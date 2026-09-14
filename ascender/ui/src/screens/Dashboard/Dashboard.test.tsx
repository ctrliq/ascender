import type { MockedFunction } from 'vitest';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  DashboardAPI,
  RootAPI,
  UnifiedJobTemplatesAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Dashboard from './Dashboard';

vi.mock('../../api');

// DashboardGraph's LineChart draws with d3, which needs
// SVGPathElement.getTotalLength (absent in jsdom). The chart isn't what these
// tests cover, so stub it and assert on the dashboard's tabs/counts + requests.
vi.mock('./shared/LineChart', () => ({
  default: () => <div data-testid="line-chart" />,
}));

describe('<Dashboard />', () => {
  let graphRequest: MockedFunction<typeof DashboardAPI.readJobGraph>;

  beforeEach(() => {
    vi.mocked(DashboardAPI.read).mockResolvedValue(
      {} as unknown as ResponseOf<typeof DashboardAPI.read>
    );
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);
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
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);
    vi.mocked(UnifiedJobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: {}, related_search_fields: [] },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.readOptions>);
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: {} },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
    vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: {} },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders without crashing', async () => {
    renderWithContexts(<Dashboard />);
    expect(
      await screen.findByRole('tab', { name: 'Job status graph tab' })
    ).toBeInTheDocument();
  });

  test('renders dashboard graph by default', async () => {
    renderWithContexts(<Dashboard />);
    // The Job status tab is active by default, so DashboardGraph mounts and
    // requests the default (all/month) job graph data.
    await screen.findByRole('tab', { name: 'Job status graph tab' });
    expect(await screen.findByTestId('line-chart')).toBeInTheDocument();
    await waitFor(() =>
      expect(graphRequest).toHaveBeenCalledWith({
        job_type: 'all',
        period: 'month',
      })
    );
  });

  test('renders template list when the active tab is changed', async () => {
    const { user } = renderWithContexts(<Dashboard />);
    const templatesTab = await screen.findByRole('tab', {
      name: 'Recent Templates list tab',
    });
    await user.click(templatesTab);
    // TemplateList mounts and fetches; with an empty result it renders its
    // empty-state, confirming the list (not the graph) is now shown.
    expect(await screen.findByText('No Templates Found')).toBeInTheDocument();
    await waitFor(() => expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled());
  });
});
