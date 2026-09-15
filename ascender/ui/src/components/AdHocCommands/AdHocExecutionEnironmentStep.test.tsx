import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { ExecutionEnvironmentsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdHocExecutionEnvironmentStep from './AdHocExecutionEnvironmentStep';

vi.mock('../../api/models/ExecutionEnvironments');

describe('<AdHocExecutionEnvironmentStep />', () => {
  beforeEach(async () => {
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'EE1 1', url: 'wwww.google.com' },
          { id: 2, name: 'EE2', url: 'wwww.google.com' },
        ],
        count: 2,
      },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.read>);
    vi.mocked(ExecutionEnvironmentsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} } },
    } as unknown as ResponseOf<typeof ExecutionEnvironmentsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should mount properly', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <AdHocExecutionEnvironmentStep organizationId={1} />
      </FormRoot>
    );
    // OptionsList renders the fetched rows once loading resolves
    await waitFor(() => expect(screen.getByText('EE1 1')).toBeInTheDocument());
  });

  test('should call api', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <AdHocExecutionEnvironmentStep organizationId={1} />
      </FormRoot>
    );
    await waitFor(() => expect(screen.getByText('EE1 1')).toBeInTheDocument());
    expect(ExecutionEnvironmentsAPI.read).toHaveBeenCalled();
    // two CheckboxListItem rows (one per result) render a radio select cell
    expect(screen.getByText('EE2')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
