import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';

import ExecutionEnvironmentDetail from './ExecutionEnvironmentDetail';

const mockExecutionEnvironment = {
  id: 2,
  name: 'Foo',
  image: 'quay.io/ansible/awx-ee',
  pull: 'missing',
  description: '',
};

describe('<ExecutionEnvironmentDetail/>', () => {
  test('should display execution environment detail', () => {
    renderWithContexts(
      <ExecutionEnvironmentDetail
        executionEnvironment={mockExecutionEnvironment}
      />
    );
    assertDetail('Execution Environment', mockExecutionEnvironment.name);
    expect(
      screen.getByRole('link', { name: mockExecutionEnvironment.name })
    ).toHaveAttribute(
      'href',
      `/execution_environments/${mockExecutionEnvironment.id}/details`
    );
  });

  test('should display warning deleted execution environment', async () => {
    const { user } = renderWithContexts(
      <ExecutionEnvironmentDetail verifyMissingVirtualEnv={false} />
    );
    assertDetail('Execution Environment', 'Missing resource');
    // The deleted-EE warning wraps the icon in a PF Tooltip; its content is
    // only rendered into the DOM on hover, so we assert it after hovering.
    const term = screen.getByText('Execution Environment');
    const icon = term.nextElementSibling.querySelector('svg');
    await user.hover(icon);
    await waitFor(() => {
      expect(
        screen.getByText('Execution environment is missing or deleted.')
      ).toBeInTheDocument();
    });
  });
});
