import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserTokenForm from './UserTokenForm';

jest.mock('../../../api');
const applications = {
  data: {
    count: 2,
    results: [
      {
        id: 1,
        name: 'app',
        description: '',
        url: '/api/v2/applications/1/',
      },
      {
        id: 4,
        name: 'application that should not crach',
        description: '',
        url: '/api/v2/applications/4/',
      },
    ],
  },
};
describe('<UserTokenForm />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(
      <UserTokenForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );

    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('add form displays all form fields', async () => {
    renderWithContexts(
      <UserTokenForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );
    expect(await screen.findByText('Application')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });

  test('inputs should update form value on change', async () => {
    ApplicationsAPI.read.mockResolvedValue(applications);
    const { user } = renderWithContexts(
      <UserTokenForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );
    await user.click(await screen.findByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('app'));
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByDisplayValue('app')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Description'), 'new Bar');
    expect(screen.getByLabelText('Description')).toHaveValue('new Bar');

    await user.selectOptions(screen.getByLabelText('Select Input'), 'read');
    expect(screen.getByLabelText('Select Input')).toHaveValue('read');
  });

  test('should call handleSubmit when Submit button is clicked', async () => {
    ApplicationsAPI.read.mockResolvedValue(applications);
    const handleSubmit = jest.fn();
    const { user } = renderWithContexts(
      <UserTokenForm handleSubmit={handleSubmit} handleCancel={jest.fn()} />
    );

    await user.selectOptions(
      await screen.findByLabelText('Select Input'),
      'read'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = jest.fn();
    const { user } = renderWithContexts(
      <UserTokenForm handleSubmit={jest.fn()} handleCancel={handleCancel} />
    );
    expect(handleCancel).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });
  test('should throw error on submit without scope value', async () => {
    ApplicationsAPI.read.mockResolvedValue(applications);
    const handleSubmit = jest.fn();
    const { user } = renderWithContexts(
      <UserTokenForm handleSubmit={handleSubmit} handleCancel={jest.fn()} />
    );

    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Please enter a value.')
    ).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
