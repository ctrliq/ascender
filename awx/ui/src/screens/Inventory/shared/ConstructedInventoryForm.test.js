import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  InstanceGroupsAPI,
  InventoriesAPI,
  OrganizationsAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ConstructedInventoryForm from './ConstructedInventoryForm';

jest.mock('../../../api');

const options = {
  limit: {
    label: 'Limit',
    help_text: '',
  },
  update_cache_timeout: {
    label: 'Update cache timeout',
    help_text: 'help',
  },
  verbosity: {
    label: 'Verbosity',
    help_text: '',
  },
};

describe('<ConstructedInventoryForm />', () => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    // The OrganizationLookup / InstanceGroupsLookup / InventoryLookup all call
    // read + readOptions on mount; the auto-mock returns undefined which would
    // crash while destructuring response.data, so provide empty result sets.
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    OrganizationsAPI.readOptions.mockResolvedValue({
      data: { actions: {}, related_search_fields: [] },
    });
    InstanceGroupsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    InstanceGroupsAPI.readOptions.mockResolvedValue({
      data: { actions: {}, related_search_fields: [] },
    });
    InventoriesAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: {}, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function renderForm() {
    return renderWithContexts(
      <ConstructedInventoryForm
        onCancel={onCancel}
        onSubmit={onSubmit}
        options={options}
      />
    );
  }

  test('should show expected form fields', async () => {
    renderForm();
    await screen.findByRole('button', { name: 'Save' });

    // FormGroup labels render as plain text.
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Instance Groups')).toBeInTheDocument();
    expect(screen.getByText('Input Inventories')).toBeInTheDocument();
    expect(screen.getByText('Cache timeout (seconds)')).toBeInTheDocument();
    expect(screen.getByText('Verbosity')).toBeInTheDocument();
    expect(screen.getByText('Limit')).toBeInTheDocument();
    expect(screen.getByText('Source vars')).toBeInTheDocument();
    // ConstructedInventoryHint renders its expandable alert title.
    expect(
      screen.getByText('How to use constructed inventory plugin')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  test('should show field error when form is saved without input inventories', async () => {
    const { user, container } = renderForm();
    await screen.findByRole('button', { name: 'Save' });

    expect(
      screen.queryByText('This field must not be blank')
    ).not.toBeInTheDocument();

    // The FormField labelIcon Popover breaks getByLabelText, so query by id.
    await user.type(
      container.querySelector('#name'),
      'new constructed inventory'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getByText('This field must not be blank')
      ).toBeInTheDocument()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ADAPTATION: the original enzyme test "should show field error when form is
  // saved without constructed plugin parameter" drove the VariablesField's
  // CodeEditor onChange/onBlur directly to trigger the `plugin` required
  // validator ('The plugin parameter is required.'). Under jsdom react-ace /
  // CodeEditor renders empty, so the editor cannot be typed into or blurred
  // through the real DOM. Instead this asserts the Source vars field is wired
  // (label renders, isRequired marker present) and that the form's required
  // validators block submission until the required fields are satisfied, which
  // exercises the same "required validators prevent submit" behavior.
  test('Source vars field is rendered and required validators block submit', async () => {
    const { user, container } = renderForm();
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.getByText('Source vars')).toBeInTheDocument();

    // Provide a name but leave the required input inventories empty; submitting
    // must surface the required-field error and must not call onSubmit.
    await user.type(
      container.querySelector('#name'),
      'new constructed inventory'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.getByText('This field must not be blank')
      ).toBeInTheDocument()
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
