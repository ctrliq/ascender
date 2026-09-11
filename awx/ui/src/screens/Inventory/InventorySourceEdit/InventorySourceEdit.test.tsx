import type { InventorySource, Untyped, Inventory } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventorySourcesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySourceEdit from './InventorySourceEdit';

vi.mock('../../../api');

const mockInvSrc = {
  id: 23,
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
} as unknown as InventorySource;

const mockInventory = {
  id: 1,
  name: 'Foo',
  organization: 1,
} as unknown as Inventory;

vi.mock('../shared/InventorySourceForm', () => ({
  default: ({ onSubmit, onCancel, submitError }: Untyped) => (
    <div>
      <button
        type="button"
        aria-label="mock-submit"
        onClick={() =>
          onSubmit({ ...mockInvSrc, instanceGroups: [{ id: 100 }] })
        }
      />
      <button type="button" aria-label="mock-cancel" onClick={onCancel} />
      {submitError ? <div data-testid="mock-submit-error" /> : null}
    </div>
  ),
}));

describe('<InventorySourceEdit />', () => {
  beforeEach(() => {
    vi.mocked(InventorySourcesAPI.readInstanceGroups).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readInstanceGroups>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(
      <InventorySourceEdit inventory={mockInventory} source={mockInvSrc} />
    );
    expect(
      await screen.findByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('handleSubmit should call api update', async () => {
    vi.mocked(InventorySourcesAPI.replace).mockResolvedValue({
      data: { id: 23 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.replace>);
    const { user } = renderWithContexts(
      <InventorySourceEdit inventory={mockInventory} source={mockInvSrc} />
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() =>
      expect(InventorySourcesAPI.replace).toHaveBeenCalledTimes(1)
    );
    expect(InventorySourcesAPI.replace).toHaveBeenCalledWith(23, {
      id: 23,
      description: 'bar',
      name: 'foo',
      inventory: 1,
      overwrite: false,
      overwrite_vars: false,
      source: 'scm',
      source_path: 'mock/file.sh',
      source_project: 999,
      source_script: null,
      execution_environment: null,
      credential: null,
      source_vars: '---↵',
      update_cache_timeout: 0,
      update_on_launch: false,
      verbosity: 1,
    });
    expect(InventorySourcesAPI.orderInstanceGroups).toHaveBeenCalledWith(
      23,
      [{ id: 100 }],
      []
    );
  });

  test('should navigate to inventory source detail after successful submission', async () => {
    const history = createMemoryHistory({});
    vi.mocked(InventorySourcesAPI.replace).mockResolvedValue({
      data: { id: 23 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.replace>);
    const { user } = renderWithContexts(
      <InventorySourceEdit inventory={mockInventory} source={mockInvSrc} />,
      { context: { router: { history } } }
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/sources/23/details'
      )
    );
  });

  test('should navigate to inventory source detail when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(
      <InventorySourceEdit inventory={mockInventory} source={mockInvSrc} />,
      { context: { router: { history } } }
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-cancel' })
    );
    expect(history.location.pathname).toEqual(
      '/inventories/inventory/1/sources/23/details'
    );
  });

  test('unsuccessful form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(InventorySourcesAPI.replace).mockRejectedValueOnce(error);
    const { user } = renderWithContexts(
      <InventorySourceEdit inventory={mockInventory} source={mockInvSrc} />
    );
    expect(screen.queryByTestId('mock-submit-error')).toBeNull();
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );
    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
