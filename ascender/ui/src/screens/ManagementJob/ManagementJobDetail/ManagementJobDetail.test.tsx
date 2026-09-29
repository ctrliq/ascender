import type { SystemJobTemplate } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { SystemJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ManagementJobDetail from './ManagementJobDetail';

vi.mock('../../../api/models/SystemJobTemplates');

const sessionsJob = {
  id: 4,
  type: 'system_job_template',
  name: 'Cleanup Expired Sessions',
  description: 'Cleans out expired browser sessions',
  job_type: 'cleanup_sessions',
  summary_fields: {},
} as unknown as SystemJobTemplate;

// One of the two that keep history, and so ask how much of it to keep.
const activityStreamJob = {
  ...sessionsJob,
  id: 2,
  name: 'Cleanup Activity Stream',
  job_type: 'cleanup_activitystream',
} as unknown as SystemJobTemplate;

function renderDetail(
  systemJobTemplate: SystemJobTemplate,
  config?: Record<string, unknown>
) {
  const history = createMemoryHistory({
    initialEntries: [`/cleanup_jobs/${systemJobTemplate.id}/details`],
  });
  const rendered = renderWithContexts(
    <ManagementJobDetail systemJobTemplate={systemJobTemplate} />,
    { context: { router: { history }, ...(config ? { config } : {}) } }
  );
  return { ...rendered, history };
}

describe('<ManagementJobDetail />', () => {
  beforeEach(() => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 1500 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('launches a job that asks nothing straight away, then opens its run', async () => {
    const { history } = renderDetail(sessionsJob);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(4, {})
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/runs/management/1500/output')
    );
  });

  test('asks how many days to keep before launching a job that keeps history', async () => {
    renderDetail(activityStreamJob);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(SystemJobTemplatesAPI.launch).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(2, {
        extra_vars: { days: 30 },
      })
    );
  });

  test('offers no launch to anybody but a superuser', () => {
    renderDetail(sessionsJob, { me: { is_superuser: false } });

    expect(
      screen.queryByRole('button', { name: 'Run' })
    ).not.toBeInTheDocument();
  });
});
