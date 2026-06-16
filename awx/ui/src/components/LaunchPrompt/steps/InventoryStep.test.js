import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryStep from './InventoryStep';

jest.mock('../../../api/models/Inventories');

const inventories = [
  { id: 1, name: 'inv one', url: '/inventories/1' },
  { id: 2, name: 'inv two', url: '/inventories/2' },
  { id: 3, name: 'inv three', url: '/inventories/3' },
];

describe('InventoryStep', () => {
  beforeEach(() => {
    InventoriesAPI.read.mockResolvedValue({
      data: {
        results: inventories,
        count: 3,
      },
    });

    InventoriesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('should load inventories', async () => {
    renderWithContexts(
      <Formik>
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
      <Formik>
        <InventoryStep
          warningMessage={<div id="test-warning-message">TEST</div>}
        />
      </Formik>
    );

    expect(await screen.findByText('TEST')).toBeInTheDocument();
  });
});
