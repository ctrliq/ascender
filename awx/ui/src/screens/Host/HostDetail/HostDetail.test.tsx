import type { Untyped, Host } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import HostDetail from './HostDetail';

import mockHost from '../data.host.json';

vi.mock('../../../api');

describe('<HostDetail />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User has edit permissions', () => {
    test('should render Details', async () => {
      renderWithContexts(<HostDetail host={mockHost as unknown as Host} />);

      assertDetail('Name', 'localhost');
      assertDetail('Description', 'a good description');
      assertDetail('Inventory', 'Mikes Inventory');
      assertDetail('Created', '10/28/2019, 9:26:54 PM');
      assertDetail('Last Modified', '10/29/2019, 8:18:41 PM');
    });

    test('should show edit button for users with edit permission', () => {
      renderWithContexts(<HostDetail host={mockHost as unknown as Host} />);
      const editButton = screen.getByRole('link', { name: 'edit' });
      expect(editButton).toHaveTextContent('Edit');
      expect(editButton).toHaveAttribute('href', '/hosts/2/edit');
    });

    test('expected api call is made for delete', async () => {
      vi.mocked(HostsAPI.destroy).mockResolvedValueOnce(
        {} as unknown as ApiResponse<Untyped>
      );
      const { user } = renderWithContexts(
        <HostDetail host={mockHost as unknown as Host} />
      );

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );

      await waitFor(() => expect(HostsAPI.destroy).toHaveBeenCalledTimes(1));
    });

    test('Error dialog shown for failed deletion', async () => {
      vi.mocked(HostsAPI.destroy).mockImplementationOnce(() =>
        Promise.reject(new Error())
      );
      const { user } = renderWithContexts(
        <HostDetail host={mockHost as unknown as Host} />
      );

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );

      expect(await screen.findByText('Error!')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      );
    });
  });

  describe('User has read-only permissions', () => {
    const readOnlyHost = {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: {
          ...mockHost.summary_fields.user_capabilities,
          edit: false,
        },
        recent_jobs: [],
      },
    };

    test('should hide activity stream when there are no recent jobs', async () => {
      renderWithContexts(<HostDetail host={readOnlyHost as unknown as Host} />);
      // an empty Detail (isEmpty) renders null, so the Activity row and its
      // Sparkline are omitted entirely
      expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });

    test('should hide edit button for users without edit permission', async () => {
      renderWithContexts(<HostDetail host={readOnlyHost as unknown as Host} />);
      expect(
        screen.queryByRole('link', { name: 'edit' })
      ).not.toBeInTheDocument();
    });
  });
});
