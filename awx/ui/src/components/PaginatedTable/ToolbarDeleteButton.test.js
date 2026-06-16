import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ToolbarDeleteButton from './ToolbarDeleteButton';

jest.mock('../../api');

const itemA = {
  id: 1,
  name: 'Foo',
  summary_fields: { user_capabilities: { delete: true } },
};
const itemB = {
  id: 1,
  name: 'Foo',
  summary_fields: { user_capabilities: { delete: false } },
};
const itemC = {
  id: 1,
  username: 'Foo',
  summary_fields: { user_capabilities: { delete: false } },
};

describe('<ToolbarDeleteButton />', () => {
  let deleteDetailsRequests;
  beforeEach(() => {
    deleteDetailsRequests = [
      {
        label: 'Workflow Job Template Node',
        request: CredentialsAPI.read.mockResolvedValue({ data: { count: 1 } }),
      },
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render button', () => {
    renderWithContexts(
      <ToolbarDeleteButton onDelete={() => {}} itemsToDelete={[]} />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should open confirmation modal', async () => {
    const { user } = renderWithContexts(
      <ToolbarDeleteButton
        onDelete={() => {}}
        itemsToDelete={[itemA]}
        deleteDetailsRequests={deleteDetailsRequests}
        deleteMessage="Delete this?"
        warningMessage="Are you sure to want to delete this"
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const modal = await screen.findByRole('dialog');
    expect(CredentialsAPI.read).toHaveBeenCalled();
    expect(modal).toBeInTheDocument();
    // the delete-details badge is rendered with this aria-label
    expect(
      screen.getByLabelText('Workflow Job Template Node: 1')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'confirm delete' })
    ).not.toBeDisabled();
    expect(screen.getByLabelText('Delete this?')).toBeInTheDocument();
  });

  test('should open confirmation with enabled delete button modal', async () => {
    const { user } = renderWithContexts(
      <ToolbarDeleteButton
        onDelete={() => {}}
        itemsToDelete={[
          {
            name: 'foo',
            id: 1,
            type: 'credential_type',
            summary_fields: { user_capabilities: { delete: true } },
          },
          {
            name: 'bar',
            id: 2,
            type: 'credential_type',
            summary_fields: { user_capabilities: { delete: true } },
          },
        ]}
        deleteDetailsRequests={deleteDetailsRequests}
        deleteMessage="Delete this?"
        warningMessage="Are you sure to want to delete this"
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // multiple items skip the per-item delete details request
    expect(CredentialsAPI.read).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'confirm delete' })
    ).not.toBeDisabled();
  });

  test('should disable confirm delete button', async () => {
    const request = [
      {
        label: 'Workflow Job Template Node',
        request: CredentialsAPI.read.mockResolvedValue({ data: { count: 3 } }),
      },
    ];
    const { user } = renderWithContexts(
      <ToolbarDeleteButton
        onDelete={() => {}}
        itemsToDelete={[
          {
            name: 'foo',
            id: 1,
            type: 'credential_type',
            summary_fields: { user_capabilities: { delete: true } },
          },
        ]}
        deleteDetailsRequests={request}
        deleteMessage="Delete this?"
        warningMessage="Are you sure to want to delete this"
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(CredentialsAPI.read).toHaveBeenCalled();
    // single credential_type item with delete details disables confirm
    expect(
      screen.getByRole('button', { name: 'confirm delete' })
    ).toBeDisabled();
    expect(screen.getByLabelText('Delete this?')).toBeInTheDocument();
  });

  test('should open delete error modal', async () => {
    const request = [
      {
        label: 'Workflow Job Template Node',
        request: CredentialsAPI.read.mockRejectedValue(
          new Error({
            response: {
              config: {
                method: 'get',
                url: '/api/v2/credentals',
              },
              data: 'An error occurred',
              status: 403,
            },
          })
        ),
      },
    ];

    const { user } = renderWithContexts(
      <ToolbarDeleteButton
        onDelete={() => {}}
        itemsToDelete={[itemA]}
        deleteDetailsRequests={request}
        deleteMessage="Delete this?"
        warningMessage="Are you sure to want to delete this"
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should invoke onDelete prop', async () => {
    const onDelete = jest.fn();
    const { user } = renderWithContexts(
      <ToolbarDeleteButton onDelete={onDelete} itemsToDelete={[itemA]} />
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    expect(onDelete).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  test('should disable button when no delete permissions', () => {
    renderWithContexts(
      <ToolbarDeleteButton onDelete={() => {}} itemsToDelete={[itemB]} />
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should render tooltip', async () => {
    const { user } = renderWithContexts(
      <ToolbarDeleteButton onDelete={() => {}} itemsToDelete={[itemA]} />
    );
    // tooltip content is revealed on hover
    const button = screen.getByRole('button', { name: 'Delete' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete');
    await user.unhover(button);
  });

  test('should render tooltip for username', async () => {
    const { user } = renderWithContexts(
      <ToolbarDeleteButton onDelete={() => {}} itemsToDelete={[itemC]} />
    );
    // disabled button is wrapped in a div; hover the wrapper to show tooltip
    const button = screen.getByRole('button', { name: 'Delete' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'You do not have permission to delete Items: Foo'
    );
    await user.unhover(button);
  });
});
