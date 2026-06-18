import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventorySourcesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySourceAdd from './InventorySourceAdd';

jest.mock('../../../api');

const invSourceData = {
  credential: { id: 222 },
  description: 'bar',
  name: 'foo',
  overwrite: false,
  overwrite_vars: false,
  source: 'scm',
  source_path: 'mock/file.sh',
  source_project: { id: 999 },
  source_vars: '---↵',
  update_cache_timeout: 0,
  update_on_launch: false,
  verbosity: 1,
};

const mockInventory = {
  id: 111,
  name: 'Foo',
  organization: 2,
};

jest.mock(
  '../shared/InventorySourceForm',
  () =>
    ({ onSubmit, onCancel, submitError }) =>
      (
        <div>
          <button
            type="button"
            aria-label="mock-submit"
            onClick={() => onSubmit(invSourceData)}
          />
          <button type="button" aria-label="mock-cancel" onClick={onCancel} />
          {submitError ? <div data-testid="mock-submit-error" /> : null}
        </div>
      )
);

describe('<InventorySourceAdd />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<InventorySourceAdd inventory={mockInventory} />);
    expect(await screen.findByRole('button', { name: 'mock-submit' })).toBeInTheDocument();
  });

  test('should navigate to inventory sources list when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(
      <InventorySourceAdd inventory={mockInventory} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock-cancel' }));
    expect(history.location.pathname).toEqual(
      '/inventories/inventory/111/sources'
    );
  });

  test('should post to the api when submit is clicked', async () => {
    InventorySourcesAPI.create.mockResolvedValue({ data: {} });
    const { user } = renderWithContexts(
      <InventorySourceAdd inventory={mockInventory} />
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(InventorySourcesAPI.create).toHaveBeenCalledTimes(1)
    );
    expect(InventorySourcesAPI.create).toHaveBeenCalledWith({
      credential: 222,
      description: 'bar',
      name: 'foo',
      inventory: 111,
      overwrite: false,
      overwrite_vars: false,
      source: 'scm',
      source_path: 'mock/file.sh',
      source_project: 999,
      source_script: null,
      execution_environment: null,
      source_vars: '---↵',
      update_cache_timeout: 0,
      update_on_launch: false,
      verbosity: 1,
    });
  });

  test('successful form submission should trigger redirect', async () => {
    const history = createMemoryHistory({});
    InventorySourcesAPI.create.mockResolvedValue({
      data: { id: 123, inventory: 111 },
    });
    const { user } = renderWithContexts(
      <InventorySourceAdd inventory={mockInventory} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/111/sources/123/details'
      )
    );
  });

  test('unsuccessful form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    InventorySourcesAPI.create.mockRejectedValueOnce(error);
    const { user } = renderWithContexts(
      <InventorySourceAdd inventory={mockInventory} />
    );
    expect(screen.queryByTestId('mock-submit-error')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));
    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
