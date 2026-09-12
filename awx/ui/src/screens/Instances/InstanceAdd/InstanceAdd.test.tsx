import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { InstancesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceAdd from './InstanceAdd';

vi.mock('../../../api');

// Replace the shared form with a lightweight stub that exposes the container's
// handleSubmit / handleCancel handlers through real buttons.
vi.mock('../Shared/InstanceForm', () => {
  const MockForm = ({ handleSubmit, handleCancel }: Untyped) => (
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
  return { default: MockForm };
});

describe('<InstanceAdd />', () => {
  let history: TestHistory;

  beforeEach(() => {
    history = createMemoryHistory({ initialEntries: ['/instances'] });
    vi.mocked(InstancesAPI.create).mockResolvedValue({
      data: { id: 13 },
    } as unknown as ResponseOf<typeof InstancesAPI.create>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
