import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  DashboardAPI,
  RootAPI,
  UnifiedJobTemplatesAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Dashboard from './Dashboard';

jest.mock('../../api');

// DashboardGraph's LineChart draws with d3, which needs
// SVGPathElement.getTotalLength (absent in jsdom). The chart isn't what these
// tests cover, so stub it and assert on the dashboard's tabs/counts + requests.
jest.mock('./shared/LineChart', () => () => <div data-testid="line-chart" />);

describe('<Dashboard />', () => {
  let graphRequest;

  beforeEach(() => {
    DashboardAPI.read.mockResolvedValue({});
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    graphRequest = DashboardAPI.readJobGraph;
    graphRequest.mockResolvedValue({});
    UnifiedJobTemplatesAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    UnifiedJobTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: {}, related_search_fields: [] },
    });
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: {} },
    });
    WorkflowJobTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: {} },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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
