import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DeleteButton from './DeleteButton';

jest.mock('../../api');

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
            label: 'job',
            request: CredentialsAPI.read.mockResolvedValue({
              data: { count: 1 },
            }),
          },
        ]}
        deleteMessage="Delete this?"
        warningMessage="Are you sure to want to delete this"
      />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this?')).toBeInTheDocument();
  });

  test('should invoke onConfirm prop', async () => {
    const onConfirm = jest.fn();
    const { user } = renderWithContexts(
      <DeleteButton
        onConfirm={onConfirm}
        itemsToDelete="foo"
        deleteDetailsRequests={[
          {
            label: 'job',
            request: CredentialsAPI.read.mockResolvedValue({
              data: { count: 1 },
            }),
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
    const onConfirm = jest.fn();
    const { user } = renderWithContexts(
      <DeleteButton
        onConfirm={onConfirm}
        itemsToDelete="foo"
        deleteDetailsRequests={[
          {
            label: 'job',
            request: CredentialsAPI.read.mockRejectedValue(
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
