import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdHocExecutionEnvironmentStep from './AdHocExecutionEnvironmentStep';

jest.mock('../../api/models/ExecutionEnvironments');

describe('<AdHocExecutionEnvironmentStep />', () => {
  beforeEach(async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'EE1 1', url: 'wwww.google.com' },
          { id: 2, name: 'EE2', url: 'wwww.google.com' },
        ],
        count: 2,
      },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount properly', async () => {
    renderWithContexts(
      <Formik>
        <AdHocExecutionEnvironmentStep organizationId={1} />
      </Formik>
    );
    // OptionsList renders the fetched rows once loading resolves
    await waitFor(() => expect(screen.getByText('EE1 1')).toBeInTheDocument());
  });

  test('should call api', async () => {
    renderWithContexts(
      <Formik>
        <AdHocExecutionEnvironmentStep organizationId={1} />
      </Formik>
    );
    await waitFor(() => expect(screen.getByText('EE1 1')).toBeInTheDocument());
    expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalled();
    // two CheckboxListItem rows (one per result) render a radio select cell
    expect(screen.getByText('EE2')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
