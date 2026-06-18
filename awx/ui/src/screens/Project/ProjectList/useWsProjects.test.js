import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import WS from 'jest-websocket-mock';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useWsProjects from './useWsProjects';

function Test({ projects }) {
  const synced = useWsProjects(projects);
  return <div data-testid="result">{JSON.stringify(synced)}</div>;
}

function getResult() {
  return JSON.parse(screen.getByTestId('result').textContent);
}

describe('useWsProjects', () => {
  let debug;
  beforeEach(() => {
    debug = global.console.debug; // eslint-disable-line prefer-destructuring
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
});
