import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ApplicationForm from './ApplicationForm';

jest.mock('../../../api');

const authorizationOptions = [
  {
    key: 'authorization-code',
    label: 'Authorization code',
    value: 'authorization-code',
  },
  {
    key: 'password',
    label: 'Resource owner password-based',
    value: 'password',
  },
];

const clientTypeOptions = [
  { key: 'confidential', label: 'Confidential', value: 'confidential' },
  { key: 'public', label: 'Public', value: 'public' },
];

function renderForm(props = {}) {
  return renderWithContexts(
    <ApplicationForm
      onSubmit={() => {}}
      onCancel={() => {}}
      application={{}}
      authorizationOptions={authorizationOptions}
      clientTypeOptions={clientTypeOptions}
      {...props}
    />
  );
}

beforeEach(() => {
  // a single org so OrganizationLookup auto-populates the required field
  OrganizationsAPI.read.mockResolvedValue({
    data: { results: [{ id: 1, name: 'Default' }], count: 1 },
  });
  OrganizationsAPI.readOptions.mockResolvedValue({
    data: { actions: { GET: {} }, related_search_fields: [] },
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('<ApplicationForm/>', () => {
  test('all fields should render successfully', async () => {
    const { container } = renderForm();

    await screen.findByText('Organization');
    expect(container.querySelector('#name')).toBeInTheDocument();
    expect(container.querySelector('#description')).toBeInTheDocument();
    expect(container.querySelector('#redirect_uris')).toBeInTheDocument();
    // the two AnsibleSelects render native selects with id authType/clientType
    expect(container.querySelector('#authType')).toBeInTheDocument();
    expect(container.querySelector('#clientType')).toBeInTheDocument();
    // OrganizationLookup renders an Organization form group
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  test('should update field values', async () => {
    const { container, user } = renderForm();
    await screen.findByText('Organization');

    const nameInput = container.querySelector('#name');
    await user.type(nameInput, 'new foo');
    const descriptionInput = container.querySelector('#description');
    await user.type(descriptionInput, 'new bar');
    const redirectInput = container.querySelector('#redirect_uris');
    await user.type(redirectInput, 'https://www.google.com');

    await user.selectOptions(
      container.querySelector('#authType'),
      'authorization-code'
    );
    await user.selectOptions(
      container.querySelector('#clientType'),
      'confidential'
    );

    expect(nameInput).toHaveValue('new foo');
    expect(descriptionInput).toHaveValue('new bar');
    expect(redirectInput).toHaveValue('https://www.google.com');
    expect(container.querySelector('#authType')).toHaveValue(
      'authorization-code'
    );
    expect(container.querySelector('#clientType')).toHaveValue('confidential');
    // selecting authorization-code makes Redirect URIs required
    const redirectGroup = container
      .querySelector('#redirect_uris')
      .closest('.pf-v6-c-form__group');
    expect(within(redirectGroup).getByText('*')).toBeInTheDocument();
  });

  test('should call onCancel', async () => {
    const onCancel = jest.fn();
    const { user } = renderForm({ onCancel });
    await screen.findByText('Organization');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  test('should call onSubmit', async () => {
    const onSubmit = jest.fn();
    const { container, user } = renderForm({ onSubmit });
    await screen.findByText('Organization');

    // required selects must be filled before the form will submit
    await user.type(container.querySelector('#name'), 'foo');
    await user.selectOptions(
      container.querySelector('#authType'),
      'authorization-code'
    );
    await user.selectOptions(
      container.querySelector('#clientType'),
      'confidential'
    );
    await user.type(
      container.querySelector('#redirect_uris'),
      'http://www.google.com'
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization_grant_type: 'authorization-code',
        client_type: 'confidential',
        name: 'foo',
        redirect_uris: 'http://www.google.com',
        // ApplicationAdd/Edit read values.organization.id, so the form must
        // submit organization as an object with an id (auto-populated here)
        organization: expect.objectContaining({ id: 1 }),
      })
    );
  });

  test('should render required on Redirect URIs for authorization-code apps', async () => {
    const application = {
      id: 1,
      name: 'Alex',
      description: '',
      client_type: 'confidential',
      redirect_uris: 'http://www.google.com',
      authorization_grant_type: 'authorization-code',
      summary_fields: {
        organization: { id: 230, name: 'bar' },
        user_capabilities: { edit: true, delete: true },
      },
      organization: 230,
    };
    const { container } = renderForm({ application });
    await screen.findByText('Organization');

    const redirectGroup = container
      .querySelector('#redirect_uris')
      .closest('.pf-v6-c-form__group');
    expect(within(redirectGroup).getByText('*')).toBeInTheDocument();
  });
});
