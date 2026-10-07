import React from 'react';
import { screen } from '@testing-library/react';
import type { AnyJob } from 'types/api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentBuilderBuildDetail from './ExecutionEnvironmentBuilderBuildDetail';

vi.mock('../../../api');

const build = {
  id: 38352,
  type: 'execution_environment_builder_build',
  name: 'My builder',
  status: 'successful',
  started: '2026-10-01T06:22:53Z',
  finished: '2026-10-01T06:27:06Z',
  created: '2026-10-01T06:22:53Z',
  modified: '2026-10-01T06:22:53Z',
  job_explanation: '',
  execution_node: 'ascender_1',
  scm_revision: '74bd3473',
  launch_type: 'manual',
  related: {},
  summary_fields: {
    execution_environment_builder: {
      id: 3,
      name: 'My builder',
      image: 'quay.io/team/ee',
      tag: 'v1',
      execution_environment_file: 'ee/execution-environment.yml',
    },
    project: { id: 7, name: 'EE project' },
    credential: { id: 6, name: 'Quay' },
    source_project_update: { id: 12, status: 'successful' },
    instance_group: { id: 1, name: 'controlplane' },
    user_capabilities: { start: true, delete: true },
  },
} as unknown as AnyJob;

describe('<ExecutionEnvironmentBuilderBuildDetail />', () => {
  test('shows the builder and what it built', () => {
    renderWithContexts(<ExecutionEnvironmentBuilderBuildDetail job={build} />);
    assertDetail('Job Type', 'Execution Environment Build');
    assertDetail('Execution Environment Builder', 'My builder');
    assertDetail('Image', 'quay.io/team/ee:v1');
    assertDetail('Project', 'EE project');
    assertDetail('Execution Environment File', 'ee/execution-environment.yml');
    assertDetail('Revision', '74bd3473');
    assertDetail('Registry credential', 'Quay');
    expect(screen.getByRole('link', { name: 'My builder' })).toHaveAttribute(
      'href',
      '/execution_environment_builders/3/details'
    );
    expect(
      screen.getByRole('button', { name: 'Relaunch' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('offers cancel while running and not delete', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail
        job={{ ...build, status: 'running', finished: null } as AnyJob}
      />
    );
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('marks a deleted builder', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail
        job={
          {
            ...build,
            summary_fields: { user_capabilities: {} },
          } as unknown as AnyJob
        }
      />
    );
    expect(screen.getAllByText('Deleted').length).toBeGreaterThan(0);
  });
});
