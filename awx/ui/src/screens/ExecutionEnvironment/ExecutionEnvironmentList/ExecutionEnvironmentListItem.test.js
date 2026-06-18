import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentListItem from './ExecutionEnvironmentListItem';

jest.mock('../../../api');

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
};

const renderItem = (props = {}) =>
  renderWithContexts(
    <table>
      <tbody>
        <ExecutionEnvironmentListItem
          executionEnvironment={executionEnvironment}
          detailUrl="execution_environments/1/details"
          isSelected={false}
          onSelect={() => {}}
          onCopy={jest.fn()}
          fetchExecutionEnvironments={jest.fn().mockResolvedValue()}
          rowIndex={0}
          {...props}
        />
      </tbody>
    </table>
  );

describe('<ExecutionEnvironmentListItem/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText(executionEnvironment.image)).toBeInTheDocument();
    expect(screen.getByText('(Default)')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Edit Execution Environment')
    ).toBeInTheDocument();
  });

  test('should call api to copy execution environment', async () => {
    ExecutionEnvironmentsAPI.copy.mockResolvedValue({
      status: 201,
      data: { id: 2 },
    });
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.copy).toHaveBeenCalled()
    );
  });

  test('should render an error modal on copy failure', async () => {
    ExecutionEnvironmentsAPI.copy.mockRejectedValue(new Error());
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
    expect(screen.getByText(executionEnvironment.image)).toBeInTheDocument();
    expect(screen.getByText('(Default)')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Edit Execution Environment')
    ).not.toBeInTheDocument();
  });
});
