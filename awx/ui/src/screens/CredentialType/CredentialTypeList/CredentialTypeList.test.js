import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { CredentialTypesAPI, CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import CredentialTypeList from './CredentialTypeList';

jest.mock('../../../api/models/CredentialTypes');
jest.mock('../../../api/models/Credentials');

const credentialTypes = {
  data: {
    results: [
      {
        id: 1,
        name: 'Foo',
        kind: 'cloud',
        summary_fields: { user_capabilities: { edit: true, delete: true } },
        url: '',
      },
      {
        id: 2,
        name: 'Bar',
        kind: 'cloud',
        summary_fields: { user_capabilities: { edit: false, delete: true } },
        url: '',
      },
    ],
    count: 2,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<CredentialTypeList>', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({ data: { count: 0 } });
    CredentialTypesAPI.read.mockResolvedValue(credentialTypes);
    CredentialTypesAPI.readOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch data and render 2 rows', async () => {
    renderWithContexts(<CredentialTypeList />);
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(CredentialTypesAPI.read).toHaveBeenCalled();
    expect(CredentialTypesAPI.readOptions).toHaveBeenCalled();
  });

  test('should delete item successfully', async () => {
    const { user } = renderWithContexts(<CredentialTypeList />);
    await screen.findByText('Foo');

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // PF4 Modal aria-hides the tree in jsdom; query the confirm by label.
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    await waitFor(() =>
      expect(CredentialTypesAPI.destroy).toHaveBeenCalledWith(1)
    );
  });

  test('should not render add button when POST is not allowed', async () => {
    CredentialTypesAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    renderWithContexts(<CredentialTypeList />);
    await screen.findByText('Foo');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should show a content error when the fetch fails', async () => {
    CredentialTypesAPI.read.mockRejectedValue(new Error('nope'));
    renderWithContexts(<CredentialTypeList />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should render a deletion error modal', async () => {
    CredentialTypesAPI.destroy.mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<CredentialTypeList />);
    await screen.findByText('Foo');

    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));

    expect(await screen.findByLabelText('Deletion error')).toBeInTheDocument();
  });
});
