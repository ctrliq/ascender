import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import WS from 'jest-websocket-mock';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsProject from './useWsProject';

jest.mock('../../../api/models/Projects');

function Test({ project }) {
  const synced = useWsProject(project);
  return <div data-testid="result">{JSON.stringify(synced)}</div>;
}

function getResult() {
  return JSON.parse(screen.getByTestId('result').textContent);
}

describe('useWsProject', () => {
  let debug;

  beforeEach(() => {
    debug = global.console.debug; // eslint-disable-line prefer-destructuring
    global.console.debug = () => {};
    ProjectsAPI.readDetail.mockResolvedValue({
      data: {
        id: 1,
        summary_fields: {
          last_job: {
            id: 19,
            name: 'Test Project',
            description: '',
            finished: '2021-06-01T18:43:53.332201Z',
            status: 'successful',
            failed: false,
          },
        },
      },
    });
  });

  afterEach(() => {
    global.console.debug = debug;
    jest.clearAllMocks();
    WS.clean();
  });

  test('should return project detail', async () => {
    const project = { id: 1 };
    renderWithContexts(<Test project={project} />);

    expect(getResult()).toEqual(project);
  });

  test('should establish websocket connection', async () => {
    global.document.cookie = 'csrftoken=abc123';
    const mockServer = new WS('ws://localhost/websocket/');

    const project = { id: 1 };
    renderWithContexts(<Test project={project} />);

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

    const project = {
      id: 1,
      summary_fields: {
        last_job: {
          id: 1,
          status: 'successful',
          finished: '2020-07-02T16:25:31.839071Z',
        },
      },
    };

    renderWithContexts(<Test project={project} />);

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
    expect(getResult().summary_fields.current_job).toBeUndefined();
    expect(getResult().summary_fields.last_job.status).toEqual('successful');

    mockServer.send(
      JSON.stringify({
        group_name: 'jobs',
        project_id: 1,
        status: 'running',
        type: 'project_update',
        unified_job_id: 2,
        unified_job_template_id: 1,
      })
    );

    // getResult() round-trips through JSON, which drops keys whose value is
    // undefined (the running update has finished: undefined), so assert only
    // the stable fields rather than the whole object.
    await waitFor(() => {
      const currentJob = getResult().summary_fields.current_job;
      expect(currentJob.id).toEqual(2);
      expect(currentJob.status).toEqual('running');
    });

    mockServer.send(
      JSON.stringify({
        group_name: 'jobs',
        project_id: 1,
        status: 'successful',
        type: 'project_update',
        unified_job_id: 2,
        unified_job_template_id: 1,
        finished: '2020-07-02T16:28:31.839071Z',
      })
    );

    // a finished message triggers a readDetail refresh of the project
    await waitFor(() => expect(ProjectsAPI.readDetail).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(getResult().summary_fields.last_job).toEqual({
        id: 19,
        name: 'Test Project',
        description: '',
        finished: '2021-06-01T18:43:53.332201Z',
        status: 'successful',
        failed: false,
      })
    );
  });
});
