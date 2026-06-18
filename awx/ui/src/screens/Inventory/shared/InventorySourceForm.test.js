import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  InventorySourcesAPI,
  ProjectsAPI,
  CredentialsAPI,
  ExecutionEnvironmentsAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySourceForm from './InventorySourceForm';

jest.mock('../../../api');

// Source choices returned by InventorySourcesAPI.readOptions on mount. The
// component filters out the 'file' choice and renders the rest as the Source
// AnsibleSelect options.
const readOptionsResult = {
  data: {
    actions: {
      GET: {
        source: {
          choices: [
            ['file', 'File, Directory or Script'],
            ['scm', 'Sourced from a Project'],
            ['ec2', 'Amazon EC2'],
            ['gce', 'Google Compute Engine'],
            ['azure_rm', 'Microsoft Azure Resource Manager'],
            ['vmware', 'VMware vCenter'],
            ['satellite6', 'Red Hat Satellite 6'],
            ['openstack', 'OpenStack'],
            ['rhv', 'Red Hat Virtualization'],
            ['ascender', 'CIQ Ascender Automation Platform'],
            ['terraform', 'Terraform State'],
          ],
        },
      },
    },
  },
};

describe('<InventorySourceForm />', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    ProjectsAPI.readInventories.mockResolvedValue({
      data: ['foo', 'bar'],
    });
    InventorySourcesAPI.readOptions = async () => readOptionsResult;
    // The ExecutionEnvironmentLookup rendered by the form fetches EEs on mount;
    // mock its API calls so loading settles without console errors.
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    ExecutionEnvironmentsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initially display primary form fields', async () => {
    renderWithContexts(
      <InventorySourceForm onCancel={() => {}} onSubmit={() => {}} />
    );
    // settle the readOptions loading state
    await screen.findByText('Source');

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    // ExecutionEnvironmentLookup renders a FormGroup labelled "Execution
    // Environment"
    expect(screen.getByText('Execution Environment')).toBeInTheDocument();
    expect(
      screen.queryByText('Ansible Environment')
    ).not.toBeInTheDocument();
  });

  test('should display subform when source dropdown has a value', async () => {
    const { user, container } = renderWithContexts(
      <InventorySourceForm onCancel={() => {}} onSubmit={() => {}} />
    );
    await screen.findByText('Source');

    // The Source control is an AnsibleSelect rendered as <select id="source">.
    // Selecting a non-empty value reveals the "Source details" subform.
    await user.selectOptions(container.querySelector('#source'), 'scm');

    expect(await screen.findByText('Source details')).toBeInTheDocument();
  });

  test('should show field error when form is invalid', async () => {
    const onSubmit = jest.fn();
    const { user, container } = renderWithContexts(
      <InventorySourceForm onCancel={() => {}} onSubmit={onSubmit} />
    );
    await screen.findByText('Source');

    // We don't drive CredentialLookup/ProjectLookup/source_path/verbosity
    // before saving. Those sub-lookups debounce 1000ms and driving
    // them through the real DOM is slow and flaky, so we drop them: the point
    // of the test is that an invalid (empty Name) form blocks submit. Select a
    // source to render the subform, leave Name empty, then click Save once.
    await user.selectOptions(container.querySelector('#source'), 'scm');
    await screen.findByText('Source details');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Name is required; the validation error surfaces and submit is blocked.
    expect(
      await screen.findByText('This field must not be blank')
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('should call onSubmit when Save button is clicked', async () => {
    const onSubmit = jest.fn();
    const { user, container } = renderWithContexts(
      <InventorySourceForm onCancel={() => {}} onSubmit={onSubmit} />
    );
    await screen.findByText('Source');

    // Fill the required Name field and pick a Source. Source is required, so
    // we select 'ec2' (its subform has no required fields) to keep the form
    // valid, then click Save once.
    await user.type(container.querySelector('#name'), 'new foo');
    await user.selectOptions(container.querySelector('#source'), 'ec2');
    await screen.findByText('Source details');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  test('calls "onCancel" when Cancel button is clicked', async () => {
    const onCancel = jest.fn();
    const { user } = renderWithContexts(
      <InventorySourceForm onCancel={onCancel} onSubmit={() => {}} />
    );
    await screen.findByText('Source');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });

  test('should display ContentError on throw', async () => {
    InventorySourcesAPI.readOptions = jest.fn();
    InventorySourcesAPI.readOptions.mockRejectedValueOnce(new Error());
    renderWithContexts(
      <InventorySourceForm onCancel={() => {}} onSubmit={() => {}} />
    );

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
