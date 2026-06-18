import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import { CredentialList } from '.';
import { mockCredentials } from '../shared';

jest.mock('../../../api');

describe('<CredentialList />', () => {
  beforeEach(async () => {
    CredentialsAPI.read.mockResolvedValue({ data: mockCredentials });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch credentials from api and render them in the list', async () => {
    renderWithContexts(<CredentialList />);
    await screen.findByRole('link', { name: 'Foo' });

    expect(CredentialsAPI.read).toHaveBeenCalled();
    expect(
      screen.getAllByRole('link', { name: /Foo|Bar|Baz|FooBar|Qux/ })
    ).toHaveLength(5);
  });

  test('should show content error if credentials are not successfully fetched from api', async () => {
    CredentialsAPI.readOptions.mockRejectedValueOnce(new Error());
    renderWithContexts(<CredentialList />);

    expect(
      await screen.findByText(/There was an error loading this content/)
    ).toBeInTheDocument();
  });

  test('should check and uncheck the row item', async () => {
    const { user } = renderWithContexts(<CredentialList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    const checkbox = within(row).getByRole('checkbox');

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  test('should check all row items when select all is checked', async () => {
    const { user } = renderWithContexts(<CredentialList />);
    await screen.findByRole('link', { name: 'Foo' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);

    expect(rowCheckboxes).toHaveLength(5);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).not.toBeChecked());
  });

  test('should call api delete credentials for each selected credential', async () => {
    CredentialsAPI.destroy = jest.fn().mockResolvedValue({});
    const { user } = renderWithContexts(<CredentialList />);
    await screen.findByRole('link', { name: 'Baz' });

    const row = screen.getByRole('link', { name: 'Baz' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(CredentialsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should show error modal when credential is not successfully deleted from api', async () => {
    CredentialsAPI.destroy = jest.fn().mockRejectedValueOnce(new Error());
    const { user } = renderWithContexts(<CredentialList />);
    await screen.findByRole('link', { name: 'Foo' });

    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    await user.click(within(row).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    // The deletion-error AlertModal has no footer actions, so PF renders only
    // the modal-box X (aria-label "Close"); the app root carries aria-hidden,
    // so getByRole can't reach it — close via the real DOM node instead.
    await user.click(document.querySelector('button[aria-label="Close"]'));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });
});
