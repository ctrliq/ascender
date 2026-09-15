import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { LabelsAPI, InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { MockFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryAdd from './InventoryAdd';

vi.mock('../../../api');

const submitValues = {
  name: 'new Foo',
  organization: { id: 2 },
  instanceGroups: [
    { name: 'Bizz', id: 1 },
    { name: 'Buzz', id: 2 },
  ],
  labels: [{ name: 'label' }],
};

vi.mock('../shared/InventoryForm', () => ({
  default: ({ onSubmit, onCancel, submitError }: MockFormProps) => (
    <div>
      <button
        type="button"
        aria-label="mock-submit"
        onClick={() => onSubmit(submitValues)}
      />
      <button type="button" aria-label="mock-cancel" onClick={onCancel} />
      {submitError ? <div data-testid="mock-submit-error" /> : null}
    </div>
  ),
}));

describe('<InventoryAdd />', () => {
  beforeEach(() => {
    vi.mocked(LabelsAPI.read).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof LabelsAPI.read>);
    vi.mocked(InventoriesAPI.create).mockResolvedValue({
      data: { id: 13 },
    } as unknown as ResponseOf<typeof InventoriesAPI.create>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Initially renders successfully', () => {
    renderWithContexts(<InventoryAdd />);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    const { user } = renderWithContexts(<InventoryAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(InventoriesAPI.create).toHaveBeenCalledWith({
        name: 'new Foo',
        organization: 2,
        labels: [{ name: 'label' }],
      })
    );
    expect(InventoriesAPI.associateLabel).toHaveBeenCalledWith(
      13,
      { name: 'label' },
      2
    );
    submitValues.instanceGroups.forEach((IG) =>
      expect(InventoriesAPI.associateInstanceGroup).toHaveBeenCalledWith(
        13,
        IG.id
      )
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/inventory/13/details'
      )
    );
  });

  test('handleCancel should return the user back to the inventories list', async () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    const { user } = renderWithContexts(<InventoryAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    expect(history.location.pathname).toEqual('/inventories');
  });

  test('shows submit error when the api call fails', async () => {
    vi.mocked(InventoriesAPI.create).mockRejectedValueOnce(new Error('boom'));
    const { user } = renderWithContexts(<InventoryAdd />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
