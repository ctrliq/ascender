import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import { CredentialListItem } from '.';
import { mockCredentials } from '../shared';

jest.mock('../../../api');

function renderItem(credential) {
  return renderWithContexts(
    <table>
      <tbody>
        <CredentialListItem
          credential={credential}
          detailUrl="/foo/bar"
          isSelected={false}
          onSelect={() => {}}
          onCopy={() => {}}
          fetchCredentials={() => {}}
        />
      </tbody>
    </table>
  );
}

describe('<CredentialListItem />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(mockCredentials.results[0]);
    expect(
      screen.getByRole('link', { name: 'Edit Credential' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(mockCredentials.results[1]);
    expect(
      screen.queryByRole('link', { name: 'Edit Credential' })
    ).not.toBeInTheDocument();
  });

  test('should call api to copy template', async () => {
    CredentialsAPI.copy.mockResolvedValue({ status: 201, data: { id: 2 } });
    const { user } = renderItem(mockCredentials.results[0]);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(CredentialsAPI.copy).toHaveBeenCalled());
  });

  test('should render proper alert modal on copy error', async () => {
    CredentialsAPI.copy.mockRejectedValue(new Error());
    const { user } = renderItem(mockCredentials.results[0]);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should not render copy button', () => {
    renderItem(mockCredentials.results[1]);
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });
});
