import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import type { ExecutionEnvironmentBuilder } from '../../../types/api';
import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetails';

vi.mock('../../../api');

const builder = {
  id: 3,
  type: 'execution_environment_builder',
  name: 'My builder',
  description: 'Builds things',
  organization: 1,
  project: 7,
  credential: 6,
  image: 'quay.io/team/ee',
  tag: 'v1',
  execution_environment_file: 'ee/execution-environment.yml',
  created: '2026-10-01T06:00:00Z',
  modified: '2026-10-01T06:00:00Z',
  related: {},
  summary_fields: {
    organization: { id: 1, name: 'Default' },
    project: { id: 7, name: 'EE project' },
    credential: { id: 6, name: 'Quay' },
    user_capabilities: { edit: true, delete: true, start: true, copy: true },
  },
} as unknown as ExecutionEnvironmentBuilder;

describe('<ExecutionEnvironmentBuilderDetails />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('renders what the builder builds and where it pushes', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        executionEnvironmentBuilder={builder}
      />
    );
    await waitFor(() => expect(screen.getByText('Image')).toBeInTheDocument());
    assertDetail('Name', 'My builder');
    assertDetail('Image', 'quay.io/team/ee:v1');
    assertDetail('Project', 'EE project');
    assertDetail('Execution Environment File', 'ee/execution-environment.yml');
    assertDetail('Registry credential', 'Quay');
    assertDetail('Organization', 'Default');
    expect(screen.getByLabelText('edit')).toBeInTheDocument();
  });

  test('a build opens its output', async () => {
    vi.mocked(ExecutionEnvironmentBuildersAPI.launch).mockResolvedValue({
      data: { id: 99 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentBuildersAPI.launch>);
    const history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/3/details'],
    });
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        executionEnvironmentBuilder={builder}
      />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/build/99/output')
    );
    expect(ExecutionEnvironmentBuildersAPI.launch).toHaveBeenCalledWith(3);
  });

  test('cannot build once the project is gone', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        executionEnvironmentBuilder={
          {
            ...builder,
            summary_fields: { ...builder.summary_fields, project: undefined },
          } as unknown as ExecutionEnvironmentBuilder
        }
      />
    );
    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
  });

  test('hides the actions the user may not take', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        executionEnvironmentBuilder={
          {
            ...builder,
            summary_fields: {
              ...builder.summary_fields,
              user_capabilities: {},
            },
          } as unknown as ExecutionEnvironmentBuilder
        }
      />
    );
    expect(screen.queryByLabelText('edit')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Build' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('deletes and returns to the list', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/3/details'],
    });
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        executionEnvironmentBuilder={builder}
      />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.destroy).toHaveBeenCalledWith(3)
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/execution_environment_builders')
    );
  });
});
