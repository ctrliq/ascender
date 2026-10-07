import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import ExecutionEnvironmentFileSelect from './ExecutionEnvironmentFileSelect';

vi.mock('api');

const files = (data: string[]) =>
  ({ data }) as unknown as ResponseOf<
    typeof ProjectsAPI.readExecutionEnvironmentFiles
  >;

describe('<ExecutionEnvironmentFileSelect />', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test('picks the only file a project holds', async () => {
    vi.mocked(ProjectsAPI.readExecutionEnvironmentFiles).mockResolvedValue(
      files(['ee/execution-environment.yml'])
    );
    const onChange = vi.fn();
    renderWithContexts(
      <ExecutionEnvironmentFileSelect
        projectId={7}
        isValid
        onChange={onChange}
      />
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('ee/execution-environment.yml')
    );
    expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalledWith(7);
  });

  test('offers every file and picks none of several', async () => {
    vi.mocked(ProjectsAPI.readExecutionEnvironmentFiles).mockResolvedValue(
      files(['a/execution-environment.yml', 'b/execution-environment.yaml'])
    );
    const onChange = vi.fn();
    const { user } = renderWithContexts(
      <ExecutionEnvironmentFileSelect
        projectId={7}
        isValid
        onChange={onChange}
      />
    );
    await waitFor(() =>
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalled()
    );
    await user.click(
      screen.getByLabelText('Select an execution environment file')
    );
    await user.click(
      await screen.findByRole('option', {
        name: 'b/execution-environment.yaml',
      })
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b/execution-environment.yaml');
  });

  test('says when a project has no definition files', async () => {
    vi.mocked(ProjectsAPI.readExecutionEnvironmentFiles).mockResolvedValue(
      files([])
    );
    const { user } = renderWithContexts(
      <ExecutionEnvironmentFileSelect projectId={7} isValid />
    );
    await waitFor(() =>
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalled()
    );
    await user.click(
      screen.getByLabelText('Select an execution environment file')
    );
    expect(
      await screen.findByText(/No execution environment files found/)
    ).toBeInTheDocument();
  });

  test('stays disabled without a project', async () => {
    renderWithContexts(<ExecutionEnvironmentFileSelect isValid />);
    await waitFor(() =>
      expect(
        document.querySelector('#execution-environment-builder-file')
      ).toHaveClass('pf-m-disabled')
    );
    expect(ProjectsAPI.readExecutionEnvironmentFiles).not.toHaveBeenCalled();
  });
});
