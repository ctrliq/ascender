import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ErrorDetail from './ErrorDetail';

// Build an Error that carries a `response`, like the api errors ErrorDetail
// renders. Object.prototype.hasOwnProperty(error, 'response') drives the
// network-error vs stack-trace branch, so the property must live on the
// instance.
function makeNetworkError(response) {
  const error = new Error('request failed');
  error.response = response;
  return error;
}

describe('ErrorDetail', () => {
  test('renders the expandable Details toggle collapsed by default', () => {
    renderWithContexts(
      <ErrorDetail
        error={makeNetworkError({
          config: { method: 'post', url: '/api/v2/projects/' },
          status: 400,
          data: 'An error occurred',
        })}
      />
    );
    const toggle = screen.getByRole('button', { name: /Details/ });
    // PF ExpandableSection keeps its content mounted but hidden when collapsed,
    // so assert the collapsed state via aria-expanded rather than absence.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('expands to show the network error message on toggle', async () => {
    const { user } = renderWithContexts(
      <ErrorDetail
        error={makeNetworkError({
          config: { method: 'patch', url: '/api/v2/job_templates/1/' },
          status: 400,
          data: {
            project: ['project error'],
            inventory: ['inventory error'],
          },
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /Details/ }));

    await waitFor(() => {
      expect(screen.getByText('project error')).toBeInTheDocument();
    });
    expect(screen.getByText('inventory error')).toBeInTheDocument();
    // request line includes method, url and status
    expect(screen.getByText('400')).toBeInTheDocument();
  });
});
