import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentBuilderList from './ExecutionEnvironmentBuilderList';

jest.mock('../../../api/models/ExecutionEnvironmentBuilders');

const executionEnvironmentBuilders = {
  data: {
    results: [
      {
        id: 1,
        name: 'Builder One',
        image: 'my-custom-ee',
        tag: 'latest',
        url: '/api/v2/execution_environment_builders/1/',
        summary_fields: {
          user_capabilities: { edit: true, delete: true, copy: true, start: true },
        },
      },
      {
        id: 2,
        name: 'Builder Two',
        image: 'another-ee',
        tag: 'v2',
        url: '/api/v2/execution_environment_builders/2/',
        summary_fields: {
          user_capabilities: { edit: false, delete: true, copy: false, start: false },
        },
      },
    ],
    count: 2,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<ExecutionEnvironmentBuilderList/>', () => {
  beforeEach(() => {
    ExecutionEnvironmentBuildersAPI.read.mockResolvedValue(
      executionEnvironmentBuilders
    );
    ExecutionEnvironmentBuildersAPI.readOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should have data fetched and render 2 rows', async () => {
    renderWithContexts(<ExecutionEnvironmentBuilderList />);
    expect(await screen.findByText('Builder One')).toBeInTheDocument();
    expect(screen.getByText('Builder Two')).toBeInTheDocument();
    expect(ExecutionEnvironmentBuildersAPI.read).toHaveBeenCalled();
    expect(ExecutionEnvironmentBuildersAPI.readOptions).toHaveBeenCalled();
  });

  test('should delete items successfully', async () => {
    const { user } = renderWithContexts(<ExecutionEnvironmentBuilderList />);
    await screen.findByText('Builder One');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 0' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.destroy).toHaveBeenCalledTimes(2)
    );
  });

  test('should render deletion error modal', async () => {
    ExecutionEnvironmentBuildersAPI.destroy.mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<ExecutionEnvironmentBuilderList />);
    await screen.findByText('Builder One');

    await user.click(screen.getByRole('checkbox', { name: 'Select row 0' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    expect(await screen.findByLabelText('Deletion error')).toBeInTheDocument();
  });

  test('should show a content error when the fetch fails', async () => {
    ExecutionEnvironmentBuildersAPI.read.mockRejectedValue(new Error('nope'));
    renderWithContexts(<ExecutionEnvironmentBuilderList />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should not render add button', async () => {
    ExecutionEnvironmentBuildersAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    renderWithContexts(<ExecutionEnvironmentBuilderList />);
    await screen.findByText('Builder One');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
