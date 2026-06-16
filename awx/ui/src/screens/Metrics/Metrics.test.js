import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { MetricsAPI, InstancesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Metrics from './Metrics';

jest.mock('../../api/models/Instances');
jest.mock('../../api/models/Metrics');

describe('<Metrics/>', () => {
  let user;
  let container;

  const openSelect = async (ouiaId) => {
    const select = container.querySelector(
      `[data-ouia-component-id="${ouiaId}"]`
    );
    await user.click(within(select).getByRole('button'));
    return select;
  };

  beforeEach(async () => {
    InstancesAPI.read.mockResolvedValue({
      data: {
        results: [
          { hostname: 'instance 1', node_type: 'control' },
          { hostname: 'instance 2', node_type: 'hybrid' },
          { hostname: 'receptor', node_type: 'execution' },
        ],
      },
    });
    MetricsAPI.read.mockResolvedValue({
      data: {
        metric1: {
          helptext: 'metric 1 help text',
          samples: [{ labels: { node: 'metric 1' }, value: 20 }],
        },
        metric2: {
          helptext: 'metric 2 help text',
          samples: [{ labels: { node: 'metric 2' }, value: 10 }],
        },
      },
    });
    ({ user, container } = renderWithContexts(<Metrics />));
    // wait for the initial instances/metrics fetch to settle
    await waitFor(() => expect(InstancesAPI.read).toHaveBeenCalled());
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount properly', async () => {
    // Before an instance + metric are selected, the empty state is shown and
    // no chart is rendered.
    expect(
      await screen.findByText('Select an instance and a metric to show chart')
    ).toBeInTheDocument();
    expect(document.querySelector('#chart')).toBeNull();
  });

  test('should render chart after selecting metric and instance', async () => {
    // open the Instance select and pick "instance 1"
    const instanceSelect = await openSelect('Instance-select');
    await user.click(within(instanceSelect).getByText('instance 1'));

    // open the Metric select and pick "metric1"
    const metricSelect = await openSelect('Metric-select');
    await user.click(within(metricSelect).getByText('metric1'));

    await waitFor(() =>
      expect(MetricsAPI.read).toHaveBeenCalledWith({
        subsystemonly: 1,
        format: 'json',
        metric: 'metric1',
        node: 'instance 1',
      })
    );
  });

  test('should not include receptor instances', async () => {
    const instanceSelect = await openSelect('Instance-select');

    const listbox = await within(instanceSelect).findByRole('listbox');
    // execution-node ("receptor") instances are filtered out; the two
    // non-execution instances plus the "All" option remain (3 total).
    expect(within(listbox).queryByText('receptor')).toBeNull();
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });
});
