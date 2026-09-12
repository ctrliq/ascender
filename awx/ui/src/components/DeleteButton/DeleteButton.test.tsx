import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DeleteButton from './DeleteButton';

vi.mock('../../api');

describe('<DeleteButton />', () => {
  test('should render button', () => {
    renderWithContexts(<DeleteButton onConfirm={() => {}} name="Foo" />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should open confirmation modal', async () => {
    const { user } = renderWithContexts(
      <DeleteButton
        onConfirm={() => {}}
        name="Foo"
        deleteDetailsRequests={[
          {
            label: { id: 'job', message: 'job' },
            request: vi.mocked(CredentialsAPI.read).mockResolvedValue({
              data: { count: 1 },
            } as unknown as ResponseOf<typeof CredentialsAPI.read>),
          },
        ]}
        deleteMessage="Delete this?"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this?')).toBeInTheDocument();
  });

  test('should invoke onConfirm prop', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <DeleteButton
        onConfirm={onConfirm}
        deleteDetailsRequests={[
          {
            label: { id: 'job', message: 'job' },
            request: vi.mocked(CredentialsAPI.read).mockResolvedValue({
              data: { count: 1 },
            } as unknown as ResponseOf<typeof CredentialsAPI.read>),
          },
        ]}
        deleteMessage="Delete this?"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    expect(onConfirm).toHaveBeenCalled();
  });

  test('should show delete details error', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <DeleteButton
        onConfirm={onConfirm}
        deleteDetailsRequests={[
          {
            label: { id: 'job', message: 'job' },
            request: vi.mocked(CredentialsAPI.read).mockRejectedValue(
              Object.assign(new Error('An error occurred'), {
                response: {
                  config: {
                    method: 'get',
                    url: '/api/v2/credentials',
                  },
                  data: 'An error occurred',
                  status: 403,
                },
              })
            ),
          },
        ]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(screen.getByText('Error!')).toBeInTheDocument();
    });
  });
});
