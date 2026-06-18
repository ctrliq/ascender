import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventoriesAPI, OrganizationsAPI, InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SmartInventoryForm from './SmartInventoryForm';

jest.mock('../../../api');

// Inventory with an organization already set via summary_fields, so that
// SmartInventoryForm's initialValues seed `organization` with a value. This
// enables the HostFilterLookup (it is disabled while organization is falsy)
// without driving the OrganizationLookup modal through the DOM.
const inventoryWithOrg = {
  summary_fields: {
    organization: { id: 1, name: 'mock organization' },
  },
};

describe('<SmartInventoryForm />', () => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    // NOTE: jest auto-mock shares prototype methods across API instances, so
    // InventoriesAPI/OrganizationsAPI/InstanceGroupsAPI all reference the SAME
    // readOptions mock fn (and the same read mock fn). A single resolved value
    // must therefore satisfy every caller: the form needs actions.POST, while
    // the lookups need related_search_fields + actions (getSearchableKeys
    // tolerates a missing GET). This combined payload covers both.
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: true }, related_search_fields: [] },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    InstanceGroupsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // The form renders once with Save disabled (options not yet loaded), then
  // re-renders after InventoriesAPI.readOptions resolves with the POST
  // capability. Wait for the loaded state (Save enabled) before asserting.
  async function settleForm() {
    await screen.findByText('Smart host filter');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    );
  }

  test('should enable save button when user has POST capability', async () => {
    renderWithContexts(
      <SmartInventoryForm onCancel={onCancel} onSubmit={onSubmit} />
    );

    await settleForm();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  test('should show expected form fields', async () => {
    renderWithContexts(
      <SmartInventoryForm onCancel={onCancel} onSubmit={onSubmit} />
    );
    await settleForm();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Smart host filter')).toBeInTheDocument();
    expect(screen.getByText('Instance Groups')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // The host filter field is disabled until the form's `organization` value is
  // truthy. Instead of driving OrganizationLookup.onChange directly, we
  // seed `organization` from initialValues (inventory.summary_fields). The
  // HostFilterLookup's search/open button has id="host-filter" and receives the
  // `isDisabled` prop, which renders as the button's `disabled` attribute, so we
  // query that button to read the enabled/disabled signal.
  test('should disable host filter field when organization has no value', async () => {
    const { container } = renderWithContexts(
      <SmartInventoryForm onCancel={onCancel} onSubmit={onSubmit} />
    );
    await settleForm();

    expect(container.querySelector('#host-filter')).toBeDisabled();
  });

  test('should enable host filter field when organization has a value', async () => {
    const { container } = renderWithContexts(
      <SmartInventoryForm
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    expect(container.querySelector('#host-filter')).not.toBeDisabled();
  });

  test('should show error when form is saved without a host filter value', async () => {
    // Render with an organization set so the lookup is enabled and Save can
    // proceed to validation; host_filter starts blank so required() fails.
    const { user, container } = renderWithContexts(
      <SmartInventoryForm
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    await user.type(container.querySelector('#name'), 'new smart inventory');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getByText(/This field must not be blank/)
      ).toBeInTheDocument()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // HostFilterLookup.onChange could set a host_filter string whose ChipGroup
  // chips we then assert on, but it is not drivable through the real DOM without
  // opening its search modal, but the `?host_filter=` query-param path
  // exercises the same chip-rendering code: initialValues seeds host_filter
  // from the param, and HostFilterLookup builds chips from `value`. This single
  // query-param-seeded test folds in the original separate chip-display tests.
  test('should display filter chips when host filter is seeded from the query param', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/inventories/smart_inventory/add?host_filter=name__icontains%3Dfoo',
      ],
    });
    renderWithContexts(
      <SmartInventoryForm onCancel={onCancel} onSubmit={onSubmit} />,
      { context: { router: { history } } }
    );
    await screen.findByText('Smart host filter');

    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('should submit expected form values on save', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/inventories/smart_inventory/add?host_filter=name__icontains%3Dfoo',
      ],
    });
    const { user, container } = renderWithContexts(
      <SmartInventoryForm
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
      { context: { router: { history } } }
    );
    await settleForm();

    await user.type(container.querySelector('#name'), 'new smart inventory');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Matching the exact object is brittle (organization/instance_groups shapes),
    // so assert the kind and name on the submitted argument instead.
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.kind).toBe('smart');
    expect(submitted.name).toBe('new smart inventory');
  });

  test('should throw content error when options request fails', async () => {
    // readOptions is the shared mock; when it rejects the form short-circuits
    // to ContentError before any lookup mounts, so the lookups never call it.
    // A blanket reject (not ...Once) reliably fails the form's own request.
    InventoriesAPI.readOptions.mockRejectedValue(new Error());
    renderWithContexts(
      <SmartInventoryForm onCancel={onCancel} onSubmit={onSubmit} />
    );

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should render FormSubmitError when submitError prop is passed', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    renderWithContexts(
      <SmartInventoryForm
        submitError={error}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await screen.findByText('Smart host filter');

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
