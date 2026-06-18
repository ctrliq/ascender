import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InstancesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceAdd from './InstanceAdd';

jest.mock('../../../api');

// Replace the shared form with a lightweight stub that exposes the container's
// handleSubmit / handleCancel handlers through real buttons.
jest.mock('../Shared/InstanceForm', () => {
  const MockForm = ({ handleSubmit, handleCancel }) => (
    <div>
      <button
        type="button"
        aria-label="Save"
        onClick={() => handleSubmit({ node_type: 'hop' })}
      >
        Save
      </button>
      <button type="button" aria-label="Cancel" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );
  return MockForm;
});

describe('<InstanceAdd />', () => {
  let history;

  beforeEach(() => {
    history = createMemoryHistory({ initialEntries: ['/instances'] });
    InstancesAPI.create.mockResolvedValue({ data: { id: 13 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Initially renders successfully', () => {
    renderWithContexts(<InstanceAdd />, {
      context: { router: { history } },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    const { user } = renderWithContexts(<InstanceAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(InstancesAPI.create).toHaveBeenCalledWith({
        listener_port: null, // injected if listener_port is not set
        node_type: 'hop',
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/instances/13/details')
    );
  });

  test('handleCancel should return the user back to the instances list', async () => {
    const { user } = renderWithContexts(<InstanceAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/instances');
  });
});
