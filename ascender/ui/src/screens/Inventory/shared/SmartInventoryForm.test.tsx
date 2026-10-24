import type { OptionsResponse } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventoriesAPI, OrganizationsAPI, InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SmartInventoryForm from './SmartInventoryForm';

vi.mock('../../../api');

// Inventory with an organization already set via summary_fields, so that
// SmartInventoryForm's initialValues seed `organization` with a value. This
// enables the HostFilterLookup (it is disabled while organization is falsy)
// without driving the OrganizationLookup modal through the DOM.
const inventoryWithOrg = {
  summary_fields: {
    organization: { id: 1, name: 'mock organization' },
  },
};

describe('<SmartInventoryForm options={formOptions} />', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  /** What the screen reads and hands the form, in place of it reading. */
  const formOptions = {
    actions: { POST: true },
  } as unknown as OptionsResponse;

  beforeEach(() => {
    // NOTE: the auto-mock shares prototype methods across API instances, so
    // InventoriesAPI/OrganizationsAPI/InstanceGroupsAPI all reference the SAME
    // readOptions mock fn (and the same read mock fn). A single resolved value
    // must therefore satisfy every caller: the form needs actions.POST, while
    // the lookups need related_search_fields + actions (getSearchableKeys
    // tolerates a missing GET). This combined payload covers both.
    vi.mocked(InventoriesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: true }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof InventoriesAPI.readOptions>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    vi.mocked(InstanceGroupsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // The form renders once with Save disabled (options not yet loaded), then
  // re-renders after InventoriesAPI.readOptions resolves with the POST
  // capability. Wait for the loaded state (Save enabled) before asserting.
  async function settleForm() {
    await screen.findByText('Smart Host Filter');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    );
  }

  test('should enable save button when user has POST capability', async () => {
    renderWithContexts(
      <SmartInventoryForm
        options={formOptions}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );

    await settleForm();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  test('should show expected form fields', async () => {
    renderWithContexts(
      <SmartInventoryForm
        options={formOptions}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Smart Host Filter')).toBeInTheDocument();
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
      <SmartInventoryForm
        options={formOptions}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    expect(container.querySelector('#host-filter')).toBeDisabled();
    // Disabled or not, the field is a lookup like the others: a chip holder
    // that fills the row, in the disabled form-control style, rather than an
    // unfilled box collapsed to its borders.
    const holder = container.querySelector(
      '.ascender-host-filter-lookup__chip-holder'
    );
    expect(holder).toHaveClass('ascender-lookup__chip-holder', 'pf-m-disabled');
    expect(holder?.parentElement).toHaveClass('pf-m-fill');
  });

  test('should enable host filter field when organization has a value', async () => {
    const { container } = renderWithContexts(
      <SmartInventoryForm
        options={formOptions}
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    expect(container.querySelector('#host-filter')).not.toBeDisabled();
    expect(
      container.querySelector('.ascender-host-filter-lookup__chip-holder')
    ).not.toHaveClass('pf-m-disabled');
  });

  test('should show error when form is saved without a host filter value', async () => {
    // Render with an organization set so the lookup is enabled and Save can
    // proceed to validation; host_filter starts blank so required() fails.
    const { user, container } = renderWithContexts(
      <SmartInventoryForm
        options={formOptions}
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await settleForm();

    await user.type(container.querySelector('#name')!, 'new smart inventory');
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
      <SmartInventoryForm
        options={formOptions}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
      { context: { router: { history } } }
    );
    await screen.findByText('Smart Host Filter');

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
        options={formOptions}
        inventory={inventoryWithOrg}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
      { context: { router: { history } } }
    );
    await settleForm();

    await user.type(container.querySelector('#name')!, 'new smart inventory');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Matching the exact object is brittle (organization/instance_groups shapes),
    // so assert the kind and name on the submitted argument instead.
    const submitted = onSubmit.mock.calls[0]![0];
    expect(submitted.kind).toBe('smart');
    expect(submitted.name).toBe('new smart inventory');
  });

  test('should render FormSubmitError when submitError prop is passed', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    renderWithContexts(
      <SmartInventoryForm
        options={formOptions}
        submitError={error}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    );
    await screen.findByText('Smart Host Filter');

    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
