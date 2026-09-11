import type { ExecutionEnvironment } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentListItem from './ExecutionEnvironmentListItem';

vi.mock('../../../api');

const executionEnvironment = {
  name: 'Foo',
  id: 1,
  image: 'https://registry.com/r/image/manifest',
  organization: null,
  credential: null,
  summary_fields: {
    user_capabilities: { edit: true, copy: true, delete: true },
  },
  managed: false,
} as unknown as ExecutionEnvironment;

const renderItem = (props = {}) =>
  renderWithContexts(
    <table>
      <tbody>
        <ExecutionEnvironmentListItem
          executionEnvironment={executionEnvironment}
          detailUrl="execution_environments/1/details"
          isSelected={false}
          onSelect={() => {}}
          onCopy={vi.fn()}
          fetchExecutionEnvironments={vi.fn().mockResolvedValue(undefined)}
          rowIndex={0}
          {...props}
        />
      </tbody>
    </table>
  );

describe('<ExecutionEnvironmentListItem/>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(
      screen.getByText(executionEnvironment.image as string)
    ).toBeInTheDocument();
    expect(screen.getByText('(Default)')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Edit Execution Environment')
    ).toBeInTheDocument();
  });

  test('should call api to copy execution environment', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.copy).mockResolvedValue({
      status: 201,
      data: { id: 2 },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.copy>);
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.copy).toHaveBeenCalled()
    );
  });

  test('should render an error modal on copy failure', async () => {
    vi.mocked(ExecutionEnvironmentsAPI.copy).mockRejectedValue(new Error());
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(
      await screen.findByText('Failed to copy execution environment')
    ).toBeInTheDocument();
  });

  test('should not render copy button without copy capability', () => {
    renderItem({
      executionEnvironment: {
        ...executionEnvironment,
        summary_fields: { user_capabilities: { copy: false } },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });

  test('should not render the edit action for a managed ee', () => {
    renderItem({
      executionEnvironment: {
        ...executionEnvironment,
        summary_fields: { user_capabilities: { edit: false } },
        managed: true,
      },
    });
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(
      screen.getByText(executionEnvironment.image as string)
    ).toBeInTheDocument();
    expect(screen.getByText('(Default)')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Edit Execution Environment')
    ).not.toBeInTheDocument();
  });
});
