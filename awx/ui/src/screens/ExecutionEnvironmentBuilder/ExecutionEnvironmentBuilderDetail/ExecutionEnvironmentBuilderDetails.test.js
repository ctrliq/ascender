import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetails';

jest.mock('../../../api');

const builder = {
  id: 17,
  type: 'execution_environment_builder',
  url: '/api/v2/execution_environment_builders/17/',
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'latest',
  execution_environment_file: 'execution-environment.yml',
  created: '2024-09-17T20:14:15.408782Z',
  modified: '2024-09-17T20:14:15.408802Z',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
      copy: true,
      start: true,
    },
    project: {
      id: 7,
      name: 'Demo Project',
    },
    credential: {
      id: 4,
      name: 'Container Registry',
    },
    organization: {
      id: 1,
      name: 'Default',
    },
    created_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
    modified_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
  },
};

const withCapabilities = (capabilities) => ({
  ...builder,
  summary_fields: {
    ...builder.summary_fields,
    user_capabilities: {
      ...builder.summary_fields.user_capabilities,
      ...capabilities,
    },
  },
});

describe('<ExecutionEnvironmentBuilderDetails/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details properly', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    assertDetail('Name', builder.name);
    assertDetail('Image', builder.image);
    assertDetail('Tag', builder.tag);
    assertDetail('Credential', builder.summary_fields.credential.name);
    assertDetail('Project', builder.summary_fields.project.name);
    assertDetail(
      'Execution environment file',
      builder.execution_environment_file
    );
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
  });

  test('should render loading state', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={null} isLoading />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('should render not found when builder is null and not loading', () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={null} isLoading={false} />
    );
    expect(screen.getByText(/not found/)).toBeInTheDocument();
  });

  test('should show launch button for users with start permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    expect(
      await screen.findByRole('button', { name: 'Launch' })
    ).toBeInTheDocument();
  });

  test('should hide launch button for users without start permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        builder={withCapabilities({ start: false })}
        isLoading={false}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Launch' })
    ).not.toBeInTheDocument();
  });

  test('should show edit button for users with edit permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    expect(
      await screen.findByRole('link', { name: 'Edit' })
    ).toBeInTheDocument();
  });

  test('should hide edit button for users without edit permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        builder={withCapabilities({ edit: false })}
        isLoading={false}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  test('should show delete button for users with delete permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    expect(
      await screen.findByRole('button', { name: 'Delete' })
    ).toBeInTheDocument();
  });

  test('should hide delete button for users without delete permission', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        builder={withCapabilities({ delete: false })}
        isLoading={false}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/17/details'],
    });
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />,
      {
        context: { router: { history } },
      }
    );
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('Confirm Delete'));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.destroy).toHaveBeenCalledTimes(1)
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/execution_environment_builders')
    );
  });

  test('should call launch api when launch button is clicked', async () => {
    ExecutionEnvironmentBuildersAPI.launch.mockResolvedValue({
      status: 201,
      data: { execution_environment_builder_build: 99 },
    });
    const { user } = renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    await user.click(await screen.findByRole('button', { name: 'Launch' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.launch).toHaveBeenCalledWith(17, {
        name: 'Test Builder',
      })
    );
  });

  test('should render organization detail', async () => {
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    assertDetail('Organization', builder.summary_fields.organization.name);
  });

  test('should not render organization detail when not present', async () => {
    const builderWithoutOrg = {
      ...builder,
      summary_fields: {
        ...builder.summary_fields,
        organization: undefined,
      },
    };
    renderWithContexts(
      <ExecutionEnvironmentBuilderDetails
        builder={builderWithoutOrg}
        isLoading={false}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });
});
