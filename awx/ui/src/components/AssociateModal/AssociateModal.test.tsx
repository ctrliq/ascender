import type { Mock } from 'vitest';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AssociateModal from './AssociateModal';
import mockHosts from './data.hosts.json';

vi.mock('../../api');

describe('<AssociateModal />', () => {
  let onClose: Mock;
  let onAssociate: Mock;
  let fetchRequest: Mock;
  let optionsRequest: Mock;

  beforeEach(() => {
    onClose = vi.fn();
    onAssociate = vi.fn().mockResolvedValue(undefined);
    fetchRequest = vi.fn().mockReturnValue({ data: { ...mockHosts } });
    optionsRequest = vi.fn().mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function setup() {
    const result = renderWithContexts(
      <AssociateModal
        onClose={onClose}
        onAssociate={onAssociate}
        fetchRequest={fetchRequest}
        optionsRequest={optionsRequest}
        isModalOpen
      />
    );
    // wait for the loading state to clear and rows to render
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('should fetch and render list items', async () => {
    await setup();
    expect(fetchRequest).toHaveBeenCalledTimes(1);
    expect(optionsRequest).toHaveBeenCalledTimes(1);
    // three hosts in the mock fixture, each rendered as a selectable row
    expect(screen.getAllByRole('checkbox')).toHaveLength(mockHosts.count);
  });

  test('should update selected list chips when items are selected', async () => {
    const { user } = await setup();
    const dialog = screen.getByRole('dialog');
    // no chips initially
    expect(within(dialog).queryByText('Selected')).not.toBeInTheDocument();

    const [firstCheckbox] = screen.getAllByRole('checkbox');
    await user.click(firstCheckbox as unknown as Element);

    await waitFor(() =>
      expect(within(dialog).getByText('Selected')).toBeInTheDocument()
    );
    // the selected host name appears as a chip
    const firstName = mockHosts.results[0]!.name;
    expect(screen.getAllByText(firstName).length).toBeGreaterThanOrEqual(1);
  });

  test('save button should call onAssociate', async () => {
    const { user } = await setup();
    const [firstCheckbox] = screen.getAllByRole('checkbox');
    await user.click(firstCheckbox as unknown as Element);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(onAssociate).toHaveBeenCalledTimes(1));
    expect(onAssociate).toHaveBeenCalledWith([
      expect.objectContaining({ id: mockHosts.results[0]!.id }),
    ]);
  });

  test('cancel button should call onClose', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
