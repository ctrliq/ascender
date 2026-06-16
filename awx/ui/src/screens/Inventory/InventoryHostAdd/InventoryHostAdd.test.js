import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostAdd from './InventoryHostAdd';
import mockHost from '../shared/data.host.json';

jest.mock('../../../api');

const submitValues = {
  name: 'new name',
  description: 'new description',
  variables: '---\nfoo: bar',
};

jest.mock(
  'components/HostForm',
  () =>
    ({ handleSubmit, handleCancel, submitError }) =>
      (
        <div>
          <button
            type="button"
            aria-label="mock-submit"
            onClick={() => handleSubmit(submitValues)}
          />
          <button
            type="button"
            aria-label="mock-cancel"
            onClick={handleCancel}
          />
          {submitError ? <div aria-label="mock-submit-error" /> : null}
        </div>
      )
);

describe('<InventoryHostAdd />', () => {
  beforeEach(() => {
    HostsAPI.create.mockResolvedValue({ data: { ...mockHost } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should post to api', async () => {
    const { user } = renderWithContexts(
      <InventoryHostAdd inventory={{ id: 3 }} />
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    await waitFor(() =>
      expect(HostsAPI.create).toHaveBeenCalledWith({
        ...submitValues,
        inventory: 3,
      })
    );
  });

  test('should navigate to hosts list when cancel is clicked', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(
      <InventoryHostAdd inventory={{ id: 3 }} />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));
    expect(history.location.pathname).toEqual('/inventories/inventory/3/hosts');
  });

  test('successful form submission should trigger redirect', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(
      <InventoryHostAdd inventory={{ id: 3 }} />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/3/hosts/2/details'
      )
    );
    expect(screen.queryByLabelText('mock-submit-error')).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    HostsAPI.create.mockImplementationOnce(() => Promise.reject(new Error()));
    const { user } = renderWithContexts(
      <InventoryHostAdd inventory={{ id: 3 }} />
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    expect(await screen.findByLabelText('mock-submit-error')).toBeInTheDocument();
  });
});
