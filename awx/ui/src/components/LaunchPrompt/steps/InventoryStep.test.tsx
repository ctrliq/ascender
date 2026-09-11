import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InventoriesAPI } from 'api';
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
    } as unknown as ApiResponse<Untyped>);

    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => vi.clearAllMocks());

  test('should load inventories', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <InventoryStep />
      </Formik>
    );

    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('inv one')).toBeInTheDocument();
    expect(screen.getByText('inv two')).toBeInTheDocument();
    expect(screen.getByText('inv three')).toBeInTheDocument();
  });

  test('should show warning message when one is passed in', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <InventoryStep
          warningMessage={<div id="test-warning-message">TEST</div>}
        />
      </Formik>
    );

    expect(await screen.findByText('TEST')).toBeInTheDocument();
  });
});
