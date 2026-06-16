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
        within(dialog).getByText('This action will disassociate the following:')
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
      await user.click(
        within(dialog).getByRole('button', { name: 'Cancel' })
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    test('confirm button should call onDisassociate and close the modal', async () => {
      const handleDisassociate = jest.fn();
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
        within(dialog).getByRole('button', { name: 'confirm disassociate' })
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
      expect(screen.getByRole('button', { name: 'Disassociate' })).toBeDisabled();
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
      expect(screen.getByRole('button', { name: 'Disassociate' })).toBeDisabled();
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
      expect(screen.getByRole('button', { name: 'Disassociate' })).toBeDisabled();
    });
  });
});
