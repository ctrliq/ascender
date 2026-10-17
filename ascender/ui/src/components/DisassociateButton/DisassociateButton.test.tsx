import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DisassociateButton from './DisassociateButton';

describe('<DisassociateButton />', () => {
  describe('User has disassociate permissions', () => {
    const mockHosts = [
      {
        id: 1,
        name: 'foo',
        summary_fields: { user_capabilities: { delete: true } },
      },
      {
        id: 2,
        name: 'bar',
        summary_fields: { user_capabilities: { delete: true } },
      },
    ];

    test('should render an enabled disassociate button', () => {
      renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          itemsToDisassociate={mockHosts}
          modalNote="custom note"
          modalTitle="custom title"
        />
      );
      const button = screen.getByRole('button', { name: 'Disassociate' });
      expect(button).toBeEnabled();
    });

    test('should open confirmation modal and render expected content', async () => {
      const { user } = renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          itemsToDisassociate={mockHosts}
          modalNote="custom note"
          modalTitle="custom title"
        />
      );

      await user.click(screen.getByRole('button', { name: 'Disassociate' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('custom title')).toBeInTheDocument();
      expect(within(dialog).getByText('custom note')).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          'This disassociates the following. They are not deleted themselves:'
        )
      ).toBeInTheDocument();
      expect(within(dialog).getByText('foo')).toBeInTheDocument();
      expect(within(dialog).getByText('bar')).toBeInTheDocument();
    });

    test('cancel button should close confirmation modal', async () => {
      const { user } = renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          itemsToDisassociate={mockHosts}
          modalTitle="custom title"
        />
      );

      await user.click(screen.getByRole('button', { name: 'Disassociate' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    test('confirm button should call onDisassociate and close the modal', async () => {
      const handleDisassociate = vi.fn();
      const { user } = renderWithContexts(
        <DisassociateButton
          onDisassociate={handleDisassociate}
          itemsToDisassociate={mockHosts}
          modalTitle="custom title"
        />
      );

      await user.click(screen.getByRole('button', { name: 'Disassociate' }));
      const dialog = await screen.findByRole('dialog');
      expect(handleDisassociate).toHaveBeenCalledTimes(0);

      await user.click(
        within(dialog).getByRole('button', { name: 'Confirm Disassociate' })
      );
      expect(handleDisassociate).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('User does not have disassociate permissions', () => {
    test('should disable button when no delete permissions', () => {
      renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          itemsToDisassociate={[
            {
              id: 1,
              name: 'foo',
              summary_fields: { user_capabilities: { delete: false } },
            },
          ]}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled();
    });

    test('should disable button for control instance', () => {
      renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          itemsToDisassociate={[
            { id: 1, type: 'instance', hostname: 'awx', node_type: 'control' },
          ]}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled();
    });

    test('should disable button for a hybrid instance inside a protected instance group', () => {
      renderWithContexts(
        <DisassociateButton
          onDisassociate={() => {}}
          isProtectedInstanceGroup
          itemsToDisassociate={[
            { id: 1, type: 'instance', hostname: 'awx', node_type: 'hybrid' },
          ]}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Disassociate' })
      ).toBeDisabled();
    });
  });
});

describe('<DisassociateButton /> with a reason per item', () => {
  const rows = [
    { id: 1, name: 'kept', summary_fields: { user_capabilities: {} } },
    { id: 2, name: 'free', summary_fields: { user_capabilities: {} } },
  ];
  const reason = (item: { name?: string | null }) =>
    item.name === 'kept' ? 'Cannot leave' : null;

  test('names the reason rather than a missing permission', async () => {
    const { user } = renderWithContexts(
      <DisassociateButton
        onDisassociate={() => {}}
        itemsToDisassociate={rows}
        verifyCannotDisassociate={false}
        cannotDisassociateReason={reason}
      />
    );
    const button = screen.getByRole('button', { name: 'Disassociate' });
    expect(button).toBeDisabled();
    await user.hover(button.parentElement!);
    expect(await screen.findByText('Cannot leave: kept')).toBeInTheDocument();
    expect(
      screen.queryByText(/do not have permission/)
    ).not.toBeInTheDocument();
  });

  test('replaces the permission check for rows it lets through', () => {
    renderWithContexts(
      <DisassociateButton
        onDisassociate={() => {}}
        itemsToDisassociate={rows.slice(1)}
        cannotDisassociateReason={reason}
      />
    );
    expect(screen.getByRole('button', { name: 'Disassociate' })).toBeEnabled();
  });
});
