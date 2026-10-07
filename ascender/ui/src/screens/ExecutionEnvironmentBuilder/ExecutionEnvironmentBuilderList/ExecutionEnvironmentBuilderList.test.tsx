import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ExecutionEnvironmentBuilderList from './ExecutionEnvironmentBuilderList';

vi.mock('../../../api/models/ExecutionEnvironmentBuilders');

const builders = {
  data: {
    count: 2,
    results: [
      {
        id: 1,
        name: 'Runs',
        image: 'quay.io/team/ee',
        tag: 'v1',
        summary_fields: {
          project: { id: 7, name: 'EE project' },
          organization: { id: 1, name: 'Default' },
          user_capabilities: {
            edit: true,
            delete: true,
            start: true,
            copy: true,
          },
        },
      },
      {
        id: 2,
        name: 'Read only',
        image: 'quay.io/team/other',
        tag: 'latest',
        summary_fields: {
          project: { id: 7, name: 'EE project' },
          organization: { id: 1, name: 'Default' },
          user_capabilities: {},
        },
      },
    ],
  },
};

describe('<ExecutionEnvironmentBuilderList />', () => {
  beforeEach(() => {
    vi.mocked(ExecutionEnvironmentBuildersAPI.read).mockResolvedValue(
      builders as unknown as ApiResponse<unknown>
    );
    vi.mocked(ExecutionEnvironmentBuildersAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: true } },
    } as unknown as ApiResponse<unknown>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('lists builders with the actions each one allows', async () => {
    renderWithContexts(<ExecutionEnvironmentBuilderList />);
    expect(await screen.findByText('Runs')).toBeInTheDocument();
    const first = document.querySelector('#eeb-row-1') as HTMLElement;
    const second = document.querySelector('#eeb-row-2') as HTMLElement;
    expect(within(first).getByText('quay.io/team/ee:v1')).toBeInTheDocument();
    expect(
      within(first).getByLabelText('Build Execution Environment')
    ).toBeInTheDocument();
    expect(
      within(second).queryByLabelText('Build Execution Environment')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
    await waitFor(() =>
      expect(ExecutionEnvironmentBuildersAPI.readOptions).toHaveBeenCalled()
    );
  });
});
