import type { AnyJob } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemJobsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { OutputToolbar } from '.';
import mockJobData from '../../shared/data.job.json';

const mockJob = mockJobData as unknown as AnyJob;

vi.mock('api');

describe('<OutputToolbar />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: {
            dark: 1,
            failures: 2,
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.getByLabelText('Elapsed Time')).toBeInTheDocument();
  });

  test('should hide badge counts based on job type', () => {
    renderWithContexts(
      <OutputToolbar
        job={{ ...mockJob, type: 'system_job' }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.queryByLabelText('Play Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Host Count')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Unreachable Host Count')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Failed Host Count')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Elapsed Time')).toBeInTheDocument();
  });

  test('should hide badge if count is equal to zero', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: {},
          playbook_counts: {},
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    expect(screen.queryByLabelText('Play Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task Count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Host Count')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Unreachable Host Count')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Failed Host Count')
    ).not.toBeInTheDocument();
  });

  test('should display elapsed time as HH:MM:SS', () => {
    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          elapsed: '274265.000',
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    const elapsed = screen.getByLabelText('Elapsed Time');
    expect(within(elapsed).getByText('76:11:05')).toBeInTheDocument();
  });

  // The two counts that mean something went wrong used to be given a `color`
  // prop, which nothing read: the rule behind it was invalid CSS and the
  // browser dropped it, so both badges rendered in PatternFly's default. They
  // carry a class now, and this is what says so.
  test('marks the unreachable and failed counts as the failures they are', () => {
    const { container } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    const unreachable = container.querySelector(
      '.ascender-output-toolbar__badge--unreachable'
    );
    const failed = container.querySelector(
      '.ascender-output-toolbar__badge--failed'
    );

    expect(unreachable).toHaveTextContent('1');
    expect(failed).toHaveTextContent('2');
    // and the counts that mean nothing went wrong are left alone
    expect(
      container.querySelectorAll('.ascender-output-toolbar__badge').length
    ).toBeGreaterThan(2);
  });

  test('should hide relaunch button based on user capabilities', () => {
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Relaunch' })
    ).toBeInTheDocument();
    unmount();

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          summary_fields: {
            user_capabilities: {
              start: false,
            },
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Relaunch' })
    ).not.toBeInTheDocument();
  });

  test('leaves relaunch out for a cleanup job', () => {
    renderWithContexts(
      <OutputToolbar
        job={{ ...mockJob, type: 'system_job' }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Relaunch' })
    ).not.toBeInTheDocument();
  });

  test('should hide delete button based on user capabilities', () => {
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          host_status_counts: { dark: 1, failures: 2 },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    unmount();

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          summary_fields: {
            user_capabilities: {
              delete: false,
            },
          },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('offers Cancel on the cancel capability and the live status', () => {
    const withCaps = (caps: Record<string, boolean>, type = 'job') =>
      ({
        ...mockJob,
        type,
        summary_fields: { ...mockJob.summary_fields, user_capabilities: caps },
      }) as unknown as AnyJob;

    // A cleanup job cannot be relaunched, yet a superuser may cancel it.
    const { unmount } = renderWithContexts(
      <OutputToolbar
        job={withCaps({ start: false, cancel: true }, 'system_job')}
        jobStatus="running"
        onDelete={() => {}}
      />
    );
    expect(
      screen.getByRole('button', { name: /^Cancel / })
    ).toBeInTheDocument();
    unmount();

    // Someone who may start the job but not stop it gets no Cancel.
    const { unmount: unmount2 } = renderWithContexts(
      <OutputToolbar
        job={withCaps({ start: true, cancel: false })}
        jobStatus="running"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: /^Cancel / })
    ).not.toBeInTheDocument();
    unmount2();

    // The socket's status wins over the one the job was loaded with.
    renderWithContexts(
      <OutputToolbar
        job={withCaps({ start: true, cancel: true })}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    expect(
      screen.queryByRole('button', { name: /^Cancel / })
    ).not.toBeInTheDocument();
  });

  test('names the delete for the kind of run', async () => {
    const user = userEvent.setup();
    renderWithContexts(
      <OutputToolbar
        job={{ ...mockJob, type: 'project_update' } as unknown as AnyJob}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByRole('dialog', { name: /Delete Project Sync/ })
    ).toBeInTheDocument();
  });

  // A system job has no stdout endpoint, so its copy and download read the
  // text the job itself carries instead of leaving the header with only the
  // delete button.
  test('copies and downloads a system job output from the job itself', async () => {
    vi.mocked(SystemJobsAPI.readDetail).mockResolvedValue({
      data: { result_stdout: 'Removed 887 items\n' },
    } as unknown as Awaited<ReturnType<typeof SystemJobsAPI.readDetail>>);
    // userEvent.setup() gives the document a clipboard stub of its own, which
    // is the one the button writes into, so read the value back out of it.
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:output');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          id: 1407,
          type: 'system_job',
          related: {},
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy Output' }));
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe('Removed 887 items\n')
    );
    expect(SystemJobsAPI.readDetail).toHaveBeenCalledWith(1407);

    await user.click(screen.getByRole('button', { name: 'Download Output' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('system_job_1407.txt');
    click.mockRestore();
  });
  /*
   * fetch resolves on a refused read as well, with the error page as its body,
   * so copy used to put that page on the clipboard and say Copied. A read that
   * fails outright left an unhandled rejection and no word at all.
   */
  test('says the copy failed when the output read is refused', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '<html>denied</html>',
    }));
    vi.stubGlobal('fetch', fetchMock);

    renderWithContexts(
      <OutputToolbar
        job={{
          ...mockJob,
          related: { ...mockJob.related, stdout: '/api/v2/jobs/2/stdout/' },
        }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy Output' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Could not copy the output'
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/v2/jobs/2/stdout/?format=txt');
    expect(await navigator.clipboard.readText()).not.toContain('denied');
    vi.unstubAllGlobals();
  });

  test('says the download failed when a system job cannot be read', async () => {
    vi.mocked(SystemJobsAPI.readDetail).mockRejectedValue(
      new Error('Network Error')
    );
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderWithContexts(
      <OutputToolbar
        job={{ ...mockJob, id: 1407, type: 'system_job', related: {} }}
        jobStatus="successful"
        onDelete={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Download Output' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Could not download the output'
    );
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });
});
