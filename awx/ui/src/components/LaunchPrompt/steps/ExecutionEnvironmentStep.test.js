import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentStep from './ExecutionEnvironmentStep';

jest.mock('../../../api/models/ExecutionEnvironments');

const execution_environments = [
  { id: 1, name: 'ee one', url: '/execution_environments/1' },
  { id: 2, name: 'ee two', url: '/execution_environments/2' },
  { id: 3, name: 'ee three', url: '/execution_environments/3' },
];

describe('ExecutionEnvironmentStep', () => {
  beforeEach(() => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: execution_environments,
        count: 3,
      },
    });

    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('should load execution environments', async () => {
    renderWithContexts(
      <Formik>
        <ExecutionEnvironmentStep />
      </Formik>
    );

    await waitFor(() =>
      expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalled()
    );
    expect(await screen.findByText('ee one')).toBeInTheDocument();
    expect(screen.getByText('ee two')).toBeInTheDocument();
    expect(screen.getByText('ee three')).toBeInTheDocument();
  });
});
