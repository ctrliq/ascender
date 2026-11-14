import type { Project } from 'types/api';
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import WS from 'vitest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsProjects from './useWsProjects';

function Test({
  projects,
  onSyncFinished,
}: {
  // The fixtures carry only what the hook reads: the id, and the current job
  // the socket updates in place.
  projects: Partial<Project>[];
  onSyncFinished?: (projectId: number) => void;
}) {
  const synced = useWsProjects(projects as Project[], onSyncFinished);
  return <div data-testid="result">{JSON.stringify(synced)}</div>;
}

function getResult() {
  return JSON.parse(screen.getByTestId('result').textContent);
}

describe('useWsProjects', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    global.console.debug = debug;
    WS.clean();
  });

  test('should return projects list', async () => {
    const projects = [{ id: 1 }];
    renderWithContexts(<Test projects={projects} />);

    expect(getResult()).toEqual(projects);
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const projects = [{ id: 1 }];
    renderWithContexts(<Test projects={projects} />);

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          control: ['limit_reached_1'],
        },
      })
    );
  });

  test('should update project status', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const projects = [
      {
        id: 1,
        summary_fields: {
          current_job: {
            id: 1,
            status: 'running',
            finished: null,
          },
        },
      },
    ];
    renderWithContexts(<Test projects={projects} />);

    await mockServer.connected;
    await expect(mockServer).toReceiveMessage(
      JSON.stringify({
        xrftoken: 'abc123',
        groups: {
          jobs: ['status_changed'],
          control: ['limit_reached_1'],
        },
      })
    );
    expect(getResult()[0].summary_fields.current_job.status).toEqual('running');

    mockServer.send(
      JSON.stringify({
        project_id: 1,
        unified_job_id: 12,
        type: 'project_update',
        status: 'successful',
        finished: '2020-07-02T16:28:31.839071Z',
      })
    );

    await waitFor(() =>
      expect(getResult()[0].summary_fields.current_job.status).toEqual(
        'successful'
      )
    );
  });

  /*
   * The revision the sync wrote is not in the message, so the row has to be
   * read again: the hook says which one, and the list does the reading.
   */
  test('should ask for the row again once its sync has finished', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const onSyncFinished = vi.fn();

    renderWithContexts(
      <Test
        projects={[{ id: 1, summary_fields: {} } as Partial<Project>]}
        onSyncFinished={onSyncFinished}
      />
    );
    await mockServer.connected;

    mockServer.send(
      JSON.stringify({
        project_id: 1,
        unified_job_id: 12,
        type: 'project_update',
        status: 'running',
        finished: null,
      })
    );
    await waitFor(() =>
      expect(getResult()[0].summary_fields.current_job.status).toEqual(
        'running'
      )
    );
    expect(onSyncFinished).not.toHaveBeenCalled();

    mockServer.send(
      JSON.stringify({
        project_id: 1,
        unified_job_id: 12,
        type: 'project_update',
        status: 'successful',
        finished: '2020-07-02T16:28:31.839071Z',
      })
    );

    await waitFor(() => expect(onSyncFinished).toHaveBeenCalledWith(1));
  });

  /*
   * Two syncs ending close together each have their row read again, and both
   * answers land in their rows whatever order they arrive in, so neither
   * project is left holding its finished job.
   */
  test('should merge the read of every project whose sync finished', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const reads: Record<number, (project: Partial<Project>) => void> = {};
    const onSyncFinished = vi.fn(
      (id: number) =>
        new Promise<Project>((resolve) => {
          reads[id] = (project) => resolve(project as Project);
        })
    );

    renderWithContexts(
      <Test
        projects={[
          { id: 1, scm_revision: 'old1', summary_fields: {} },
          { id: 2, scm_revision: 'old2', summary_fields: {} },
        ]}
        onSyncFinished={onSyncFinished}
      />
    );
    await mockServer.connected;

    const finish = (projectId: number) =>
      act(() => {
        mockServer.send(
          JSON.stringify({
            project_id: projectId,
            unified_job_id: 10 + projectId,
            type: 'project_update',
            status: 'successful',
            finished: '2020-07-02T16:28:31.839071Z',
          })
        );
      });

    finish(1);
    await waitFor(() => expect(onSyncFinished).toHaveBeenCalledWith(1));
    finish(2);
    await waitFor(() => expect(onSyncFinished).toHaveBeenCalledWith(2));

    // The later read answers first.
    await act(async () => {
      reads[2]!({ id: 2, scm_revision: 'new2', summary_fields: {} });
      reads[1]!({ id: 1, scm_revision: 'new1', summary_fields: {} });
    });

    await waitFor(() =>
      expect(getResult()).toEqual([
        { id: 1, scm_revision: 'new1', summary_fields: {} },
        { id: 2, scm_revision: 'new2', summary_fields: {} },
      ])
    );
  });

  /*
   * Of two reads of the same project, only the one started last stands, even
   * when the earlier one is the slower to answer.
   */
  test('should keep the latest read of a project when two overlap', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const reads: ((project: Partial<Project>) => void)[] = [];
    const onSyncFinished = vi.fn(
      () =>
        new Promise<Project>((resolve) => {
          reads.push((project) => resolve(project as Project));
        })
    );

    renderWithContexts(
      <Test
        projects={[{ id: 1, scm_revision: 'old', summary_fields: {} }]}
        onSyncFinished={onSyncFinished}
      />
    );
    await mockServer.connected;

    const finish = (jobId: number) =>
      act(() => {
        mockServer.send(
          JSON.stringify({
            project_id: 1,
            unified_job_id: jobId,
            type: 'project_update',
            status: 'successful',
            finished: '2020-07-02T16:28:31.839071Z',
          })
        );
      });

    finish(11);
    await waitFor(() => expect(onSyncFinished).toHaveBeenCalledTimes(1));
    finish(12);
    await waitFor(() => expect(onSyncFinished).toHaveBeenCalledTimes(2));

    await act(async () => {
      reads[1]!({ id: 1, scm_revision: 'newest', summary_fields: {} });
      reads[0]!({ id: 1, scm_revision: 'older', summary_fields: {} });
    });

    await waitFor(() =>
      expect(getResult()).toEqual([
        { id: 1, scm_revision: 'newest', summary_fields: {} },
      ])
    );
  });

  /*
   * Two syncs ending in the same tick arrive before React renders either.
   * Both rows take their finished job and both are read again, where the
   * first used to be dropped and left showing Syncing.
   */
  test('should handle two syncs whose messages arrive together', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');
    const onSyncFinished = vi.fn();

    renderWithContexts(
      <Test
        projects={[
          { id: 1, summary_fields: {} },
          { id: 2, summary_fields: {} },
        ]}
        onSyncFinished={onSyncFinished}
      />
    );
    await mockServer.connected;

    act(() => {
      [1, 2].forEach((projectId) => {
        mockServer.send(
          JSON.stringify({
            project_id: projectId,
            unified_job_id: 10 + projectId,
            type: 'project_update',
            status: projectId === 1 ? 'failed' : 'successful',
            finished: '2020-07-02T16:28:31.839071Z',
          })
        );
      });
    });

    await waitFor(() => {
      const [first, second] = getResult();
      expect(first.summary_fields.current_job).toMatchObject({
        id: 11,
        status: 'failed',
      });
      expect(second.summary_fields.current_job).toMatchObject({
        id: 12,
        status: 'successful',
      });
    });
    expect(onSyncFinished).toHaveBeenCalledWith(1);
    expect(onSyncFinished).toHaveBeenCalledWith(2);
  });
});
