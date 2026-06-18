import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { ExecutionEnvironmentsAPI, ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ExecutionEnvironmentLookup from './ExecutionEnvironmentLookup';

jest.mock('../../api');

const mockedExecutionEnvironments = {
  count: 1,
  results: [
    {
      id: 2,
      name: 'Foo',
      image: 'quay.io/ansible/awx-ee',
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
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: mockedExecutionEnvironments,
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    ProjectsAPI.readDetail.mockResolvedValue({ data: { organization: 39 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <Formik>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
        />
      </Formik>
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
      <Formik>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
        />
      </Formik>
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
      <Formik>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          organizationId={1}
          globallyAvailable
        />
      </Formik>
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
      <Formik>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          projectId={12}
          globallyAvailable
        />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.readDetail).toHaveBeenCalledWith(12));
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
      <Formik>
        <ExecutionEnvironmentLookup
          value={executionEnvironment}
          onChange={() => {}}
          projectId={12}
          globallyAvailable
          isPromptableField
          promptId="ee-prompt"
          promptName="ask_execution_environment_on_launch"
        />
      </Formik>
    );
    expect(
      await screen.findByRole('checkbox', { name: 'Prompt on launch' })
    ).toBeInTheDocument();
  });
});
