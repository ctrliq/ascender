import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormRoot } from 'components/Form';
import { InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryStep from './InventoryStep';

vi.mock('../../../api/models/Inventories');

const inventories = [
  { id: 1, name: 'inv one', url: '/inventories/1' },
  { id: 2, name: 'inv two', url: '/inventories/2' },
  { id: 3, name: 'inv three', url: '/inventories/3' },
];

describe('InventoryStep', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.read).mockResolvedValue({
      data: {
        results: inventories,
        count: 3,
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.read>);

    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
  });

  afterEach(() => vi.clearAllMocks());

  test('should load inventories', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <InventoryStep />
      </FormRoot>
    );

    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('inv one')).toBeInTheDocument();
    expect(screen.getByText('inv two')).toBeInTheDocument();
    expect(screen.getByText('inv three')).toBeInTheDocument();
  });

  // Deselecting used to call field.onChange(null), and a form reads `target`
  // off what it is handed, so that threw where it stood. Nothing covered it,
  // which is how it survived.
  test('clears the selection without throwing', async () => {
    const user = userEvent.setup();

    renderWithContexts(
      <FormRoot
        initialValues={{ inventory: inventories[0] }}
        onSubmit={() => {}}
      >
        <InventoryStep />
      </FormRoot>
    );

    const close = await screen.findByRole('button', { name: 'Close inv one' });
    await user.click(close);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Close inv one' })
      ).not.toBeInTheDocument()
    );
  });

  test('should show warning message when one is passed in', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <InventoryStep
          warningMessage={<div id="test-warning-message">TEST</div>}
        />
      </FormRoot>
    );

    expect(await screen.findByText('TEST')).toBeInTheDocument();
  });
});
