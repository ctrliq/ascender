import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { ExecutionEnvironmentsAPI, ProjectsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ExecutionEnvironmentLookup from './ExecutionEnvironmentLookup';

vi.mock('../../api');

const mockedExecutionEnvironments = {
  count: 1,
  results: [
    {
      id: 2,
      name: 'Foo',
      image: 'ghcr.io/ctrliq/ascender-ee',
      pull: 'missing',
    },
  ],
};

const executionEnvironment = {
  id: 42,
  name: 'Bar',
  image: 'quay.io/ansible/bar',
  pull: 'missing',
};

describe('ExecutionEnvironmentLookup', () => {
  beforeEach(() => {
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: mockedExecutionEnvironments,
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
    vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
      data: { organization: 39 },
    } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
        />
      </FormRoot>
    );
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText('Execution Environment')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Prompt on launch' })
    ).not.toBeInTheDocument();
  });

  test('should fetch execution environments', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
        />
      </FormRoot>
    );
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalledTimes(1)
    );
    expect(
      screen.queryByText('Default Execution Environment')
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText('Execution Environment')
    ).toBeInTheDocument();
  });

  test('should call api with organization id', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          organizationId={1}
          globallyAvailable
        />
      </FormRoot>
    );
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalledWith({
        or__organization__id: 1,
        or__organization__isnull: 'True',
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
  });

  test('should call api with organization id from the related project', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          projectId={12}
          globallyAvailable
        />
      </FormRoot>
    );
    await waitFor(() =>
      expect(ProjectsAPI.readDetail).toHaveBeenCalledWith(12)
    );
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalledWith({
        or__organization__id: 39,
        or__organization__isnull: 'True',
        order_by: 'name',
        page: 1,
        page_size: 5,
      })
    );
  });

  test('should render prompt on launch checkbox when necessary', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          projectId={12}
          globallyAvailable
          isPromptableField
          promptId="ee-prompt"
          promptName="ask_execution_environment_on_launch"
        />
      </FormRoot>
    );
    expect(
      await screen.findByRole('checkbox', { name: 'Prompt on launch' })
    ).toBeInTheDocument();
  });
});
