import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { LabelsAPI, InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryEdit from './InventoryEdit';

jest.mock('../../../api');

const mockInventory = {
  id: 1,
  type: 'inventory',
  url: '/api/v2/inventories/1/',
  summary_fields: {
    organization: {
      id: 1,
      name: 'Default',
      description: '',
    },
    user_capabilities: {
      edit: true,
      delete: true,
      copy: true,
      adhoc: true,
    },
    labels: {
      results: [
        { name: 'Sushi', id: 1 },
        { name: 'Major', id: 2 },
      ],
    },
  },
  created: '2019-10-04T16:56:48.025455Z',
  modified: '2019-10-04T16:56:48.025468Z',
  name: 'Inv no hosts',
  description: '',
  organization: 1,
  kind: '',
  host_filter: null,
  variables: '---',
  has_active_failures: false,
  total_hosts: 0,
  hosts_with_active_failures: 0,
  total_groups: 0,
  groups_with_active_failures: 0,
  has_inventory_sources: false,
  total_inventory_sources: 0,
  inventory_sources_with_failures: 0,
  pending_deletion: false,
};

const associatedInstanceGroups = [
  {
    id: 1,
    name: 'Foo',
  },
];

const submitInstanceGroups = [
  { name: 'Bizz', id: 2 },
  { name: 'Buzz', id: 3 },
];
const submitLabels = [{ name: 'label' }, { name: 'Major', id: 2 }];

jest.mock(
  '../shared/InventoryForm',
  () =>
    ({ onSubmit, onCancel, submitError }) => (
      <div>
        <button
          type="button"
          aria-label="mock-submit"
          onClick={() =>
            onSubmit({
              name: 'Foo',
              id: 13,
              organization: { id: 1 },
              instanceGroups: submitInstanceGroups,
              labels: submitLabels,
            })
          }
        />
        <button type="button" aria-label="mock-cancel" onClick={onCancel} />
        {submitError ? <div data-testid="mock-submit-error" /> : null}
      </div>
    )
);

describe('<InventoryEdit />', () => {
  beforeEach(() => {
    LabelsAPI.read.mockResolvedValue({
      data: {
        results: [
          { name: 'Sushi', id: 1 },
          { name: 'Major', id: 2 },
        ],
      },
    });
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: associatedInstanceGroups,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    renderWithContexts(<InventoryEdit inventory={mockInventory} />, {
      context: { router: { history } },
    });
    expect(await screen.findByRole('button', { name: 'mock-submit' })).toBeInTheDocument();
  });

  test('called InventoriesAPI.readInstanceGroups', async () => {
    renderWithContexts(<InventoryEdit inventory={mockInventory} />);
    await waitFor(() =>
      expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledWith(1)
    );
  });

  test('handleCancel returns the user to inventory detail', async () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    const { user } = renderWithContexts(
      <InventoryEdit inventory={mockInventory} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock-cancel' }));
    expect(history.location.pathname).toEqual(
      '/inventories/inventory/1/details'
    );
  });

  test('handleSubmit should post to the api', async () => {
    const { user } = renderWithContexts(
      <InventoryEdit inventory={mockInventory} />
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(InventoriesAPI.update).toHaveBeenCalledWith(1, {
        id: 13,
        labels: [{ name: 'label' }, { name: 'Major', id: 2 }],
        name: 'Foo',
        organization: 1,
      })
    );

    expect(InventoriesAPI.associateLabel).toHaveBeenCalledWith(
      1,
      { name: 'label' },
      1
    );
    expect(InventoriesAPI.disassociateLabel).toHaveBeenCalledWith(1, {
      name: 'Sushi',
      id: 1,
    });
    expect(InventoriesAPI.orderInstanceGroups).toHaveBeenCalledWith(
      mockInventory.id,
      submitInstanceGroups,
      associatedInstanceGroups
    );
  });
});
