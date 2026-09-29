import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { SystemJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ManagementJobListItem from './ManagementJobListItem';

vi.mock('../../../api');

describe('<ManagementJobListItem/>', () => {
  const managementJob = {
    id: 3,
    name: 'Cleanup Expired Sessions',
    description: 'Cleans out expired browser sessions',
    job_type: 'cleanup_sessions',
    url: '/api/v2/system_job_templates/3/',
  };

  const renderItem = () =>
    renderWithContexts(
      <table>
        <tbody>
          <ManagementJobListItem
            id={managementJob.id}
            name={managementJob.name}
            description={managementJob.description}
            rowIndex={0}
            isSuperUser
            onLaunchError={() => {}}
          />
        </tbody>
      </table>
    );

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByText(managementJob.name)).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText(managementJob.name)).toBeInTheDocument();
    expect(screen.getByText(managementJob.description)).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Run Cleanup Job' })
    ).toBeInTheDocument();
  });

  test('asks how many days to keep before running a job that keeps history', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 9 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderWithContexts(
      <table>
        <tbody>
          <ManagementJobListItem
            id={1}
            name="Cleanup Activity Stream"
            jobType="cleanup_activitystream"
            rowIndex={0}
            isSuperUser
            isPrompted
            onLaunchError={() => {}}
          />
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('button', { name: 'Run Cleanup Job' }));
    const dialog = await screen.findByRole('dialog', {
      name: /Run Cleanup Job/,
    });
    expect(SystemJobTemplatesAPI.launch).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(1, {
        extra_vars: { days: 30 },
      })
    );
  });

  test('hands a failed launch to the list', async () => {
    const error = new Error('nope');
    vi.mocked(SystemJobTemplatesAPI.launch).mockRejectedValue(error);
    const onLaunchError = vi.fn();
    const { user } = renderWithContexts(
      <table>
        <tbody>
          <ManagementJobListItem
            id={3}
            name="Cleanup Expired Sessions"
            rowIndex={0}
            isSuperUser
            onLaunchError={onLaunchError}
          />
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('button', { name: 'Run Cleanup Job' }));
    await waitFor(() => expect(onLaunchError).toHaveBeenCalledWith(error));
  });
});
