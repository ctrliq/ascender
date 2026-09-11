import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilderListItem from './ExecutionEnvironmentBuilderListItem';

jest.mock('../../../api');

const executionEnvironmentBuilder = {
  id: 1,
  name: 'Builder One',
  image: 'my-custom-ee',
  tag: 'latest',
  summary_fields: {
    user_capabilities: { edit: true, copy: true, delete: true, start: true },
  },
};

const renderItem = (props = {}) =>
  renderWithContexts(
    <table>
      <tbody>
        <ExecutionEnvironmentBuilderListItem
          executionEnvironmentBuilder={executionEnvironmentBuilder}
          detailUrl="/execution_environment_builders/1"
          isSelected={false}
          onSelect={() => {}}
          onCopy={jest.fn()}
          rowIndex={0}
          fetchExecutionEnvironmentBuilders={jest.fn().mockResolvedValue()}
          {...props}
        />
      </tbody>
    </table>
  );

describe('<ExecutionEnvironmentBuilderListItem/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount successfully', () => {
    renderItem();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('should render the proper data', () => {
    renderItem();
    expect(screen.getByText(executionEnvironmentBuilder.name)).toBeInTheDocument();
    expect(
      screen.getByText(executionEnvironmentBuilder.image)
    ).toBeInTheDocument();
    expect(screen.getByText(executionEnvironmentBuilder.tag)).toBeInTheDocument();
    expect(screen.getByLabelText('Edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
  });

  test('should call api to copy execution environment builder', async () => {
    ExecutionEnvironmentBuildersAPI.copy.mockResolvedValue({
      status: 201,
      data: { id: 2 },
    });
    const onCopy = jest.fn();
    const { user } = renderItem({
      onCopy,
      fetchExecutionEnvironmentBuilders: jest.fn().mockResolvedValue({}),
    });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.copy).toHaveBeenCalled()
    );
  });

  test('should render proper alert modal on copy error', async () => {
    ExecutionEnvironmentBuildersAPI.copy.mockRejectedValue(new Error());
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(
      await screen.findByText('Failed to copy execution environment builder')
    ).toBeInTheDocument();
  });

  test('should not render copy button when user lacks copy permission', () => {
    renderItem({
      executionEnvironmentBuilder: {
        ...executionEnvironmentBuilder,
        summary_fields: {
          user_capabilities: { copy: false, edit: true, delete: true, start: true },
        },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });

  test('should not render edit button when user lacks edit permission', () => {
    renderItem({
      executionEnvironmentBuilder: {
        ...executionEnvironmentBuilder,
        summary_fields: {
          user_capabilities: { edit: false, copy: true, delete: true, start: true },
        },
      },
    });
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  test('should not render launch button when user lacks start permission', () => {
    renderItem({
      executionEnvironmentBuilder: {
        ...executionEnvironmentBuilder,
        summary_fields: {
          user_capabilities: { edit: true, copy: true, delete: true, start: false },
        },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Launch' })
    ).not.toBeInTheDocument();
  });

  test('should call launch api when launch button is clicked', async () => {
    ExecutionEnvironmentBuildersAPI.launch.mockResolvedValue({
      status: 201,
      data: { execution_environment_builder_build: 99 },
    });
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Launch' }));
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.launch).toHaveBeenCalledWith(1, {
        name: 'Builder One',
      })
    );
  });
});
