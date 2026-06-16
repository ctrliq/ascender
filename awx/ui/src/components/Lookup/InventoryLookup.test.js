import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import InventoryLookup from './InventoryLookup';

jest.mock('../../api');

const mockedInventories = {
  data: {
    count: 2,
    results: [
      { id: 2, name: 'Bar' },
      { id: 3, name: 'Baz' },
    ],
  },
};

describe('InventoryLookup', () => {
  beforeEach(() => {
    InventoriesAPI.read.mockResolvedValue(mockedInventories);
    InventoriesAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render successfully and fetch data', async () => {
    renderWithContexts(
      <Formik>
        <InventoryLookup onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalledTimes(1));
    expect(InventoriesAPI.read).toHaveBeenCalledWith({
      order_by: 'name',
      page: 1,
      page_size: 5,
      role_level: 'use_role',
    });
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });

  test('should fetch only regular inventories when hideSmartInventories is true', async () => {
    renderWithContexts(
      <Formik>
        <InventoryLookup onChange={() => {}} hideAdvancedInventories />
      </Formik>
    );
    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalledTimes(1));
    expect(InventoriesAPI.read).toHaveBeenCalledWith({
      not__kind: ['smart', 'constructed', 'federated'],
      order_by: 'name',
      page: 1,
      page_size: 5,
      role_level: 'use_role',
    });
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });

  test('inventory lookup should be enabled', async () => {
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
    renderWithContexts(
      <Formik>
        <InventoryLookup onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });

  test('inventory lookup should be disabled', async () => {
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
    renderWithContexts(
      <Formik>
        <InventoryLookup isDisabled onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(InventoriesAPI.read).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });
});
