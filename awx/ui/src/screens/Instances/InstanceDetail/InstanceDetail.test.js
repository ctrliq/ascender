import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import * as ConfigContext from 'contexts/Config';
import useDebounce from 'hooks/useDebounce';
import { InstancesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InstanceDetail from './InstanceDetail';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');
// The component reads useParams from react-router-dom (the route
// tree is v6); mock it there, keeping the rest of the module real.
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 1,
  }),
}));

function computeForks(memCapacity, cpuCapacity, adjustment) {
  const minCapacity = Math.min(memCapacity, cpuCapacity);
  const maxCapacity = Math.max(memCapacity, cpuCapacity);
  return Math.floor(
    minCapacity + (maxCapacity - minCapacity) * adjustment
  );
}

describe('<InstanceDetail/>', () => {
  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);

    InstancesAPI.readDetail.mockResolvedValue({
      data: {
        related: {},
        id: 1,
        type: 'instance',
        url: '/api/v2/instances/1/',
        uuid: '00000000-0000-0000-0000-000000000000',
        hostname: 'awx_1',
        created: '2021-09-08T17:10:34.484569Z',
        modified: '2021-09-09T13:55:44.219900Z',
        last_seen: '2021-09-09T20:20:31.623148Z',
        last_health_check: '2021-09-09T20:20:31.623148Z',
        errors: '',
        capacity_adjustment: '1.00',
        version: '19.1.0',
        capacity: 38,
        consumed_capacity: 0,
        percent_capacity_remaining: 100.0,
        jobs_running: 0,
        jobs_total: 0,
        cpu: 8,
        memory: 6232231936,
        cpu_capacity: 32,
        mem_capacity: 38,
        enabled: true,
        managed: false,
        managed_by_policy: true,
        node_type: 'execution',
        node_state: 'ready',
        health_check_pending: false,
      },
    });
    InstancesAPI.readInstanceGroup.mockResolvedValue({
      data: {
        results: [
          {
            id: 1,
            name: 'Foo',
          },
        ],
      },
    });
    InstancesAPI.readHealthCheckDetail.mockResolvedValue({
      data: {
        uuid: '00000000-0000-0000-0000-000000000000',
        hostname: 'awx_1',
        version: '19.1.0',
        last_health_check: '2021-09-10T16:16:19.729676Z',
        errors: '',
        cpu: 8,
        memory: 6232231936,
        cpu_capacity: 32,
        mem_capacity: 38,
        capacity: 38,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Should render proper data', async () => {
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { is_superuser: true },
    }));
    const { container } = renderWithContexts(
      <InstanceDetail setBreadcrumb={() => {}} />
    );

    expect(await screen.findByText('awx_1')).toBeInTheDocument();
    expect(InstancesAPI.readDetail).toHaveBeenCalledWith(1);
    expect(InstancesAPI.readHealthCheckDetail).toHaveBeenCalledWith(1);

    const healthCheckButton = container.querySelector(
      '[data-ouia-component-id="health-check-button"]'
    );
    expect(healthCheckButton).toBeEnabled();
  });

  test('should calculate number of forks when slide changes', async () => {
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { is_superuser: true },
    }));
    const { user, container } = renderWithContexts(
      <InstanceDetail setBreadcrumb={() => {}} />
    );

    await screen.findByText('awx_1');

    // initial capacity_adjustment is 1.00 -> min(32,38) + (38-32)*1 = 38 forks
    const forksDiv = container.querySelector('[data-cy="number-forks"]');
    expect(forksDiv).toHaveTextContent('38');
    expect(forksDiv).toHaveTextContent('forks');

    const slider = screen.getByRole('slider');

    // Drive the real slider down via keyboard; forks recompute from the
    // resulting aria-valuenow each step (PF clamps to [min,max] by step).
    slider.focus();
    await user.keyboard('{Home}{ArrowLeft}');
    await waitFor(() => {
      const adj = Math.round(Number(slider.getAttribute('aria-valuenow')) * 100) / 100;
      const expected = computeForks(38, 32, adj);
      expect(container.querySelector('[data-cy="number-forks"]')).toHaveTextContent(
        String(expected)
      );
    });

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() => {
      const adj = Math.round(Number(slider.getAttribute('aria-valuenow')) * 100) / 100;
      const expected = computeForks(38, 32, adj);
      expect(container.querySelector('[data-cy="number-forks"]')).toHaveTextContent(
        String(expected)
      );
    });
  });

  test('buttons should be disabled', async () => {
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { is_system_auditor: true },
    }));
    const { container } = renderWithContexts(
      <InstanceDetail setBreadcrumb={() => {}} />
    );

    await screen.findByText('awx_1');

    const healthCheckButton = container.querySelector(
      '[data-ouia-component-id="health-check-button"]'
    );
    expect(healthCheckButton).toBeDisabled();
  });

  test('should display instance toggle', async () => {
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { is_system_auditor: true },
    }));
    renderWithContexts(<InstanceDetail setBreadcrumb={() => {}} />);

    await screen.findByText('awx_1');
    // InstanceToggle renders a PF Switch (a checkbox) labelled "Toggle instance".
    expect(
      screen.getByRole('switch', { name: 'Toggle instance' })
    ).toBeInTheDocument();
  });

  test('Should handle api error for health check', async () => {
    InstancesAPI.healthCheck.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/instances/1/health_check',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({
      me: { is_superuser: true },
    }));
    const { user, container } = renderWithContexts(
      <InstanceDetail setBreadcrumb={() => {}} />
    );

    await screen.findByText('awx_1');

    const healthCheckButton = container.querySelector(
      '[data-ouia-component-id="health-check-button"]'
    );
    expect(healthCheckButton).toBeEnabled();

    await user.click(healthCheckButton);

    expect(InstancesAPI.healthCheck).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Details', { exact: false })).toBeInTheDocument();
  });
});
