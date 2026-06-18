import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import selectedCredential from '../data.cyberArkCredential.json';
import CredentialPluginSelected from './CredentialPluginSelected';

function setup() {
  const onClearPlugin = jest.fn();
  const onEditPlugin = jest.fn();
  const { user, container } = renderWithContexts(
    <CredentialPluginSelected
      credential={selectedCredential}
      onClearPlugin={onClearPlugin}
      onEditPlugin={onEditPlugin}
    />
  );
  return { user, container, onClearPlugin, onEditPlugin };
}

describe('<CredentialPluginSelected />', () => {
  test('renders the expected content', () => {
    setup();
    expect(screen.getByText(`${selectedCredential.name}`)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Edit Credential Plugin Configuration',
      })
    ).toBeInTheDocument();
  });

  test('clearing plugin calls expected function', async () => {
    const { user, container, onClearPlugin } = setup();
    await user.click(container.querySelector('button[aria-label="close"]'));
    expect(onClearPlugin).toHaveBeenCalledTimes(1);
  });

  test('editing plugin calls expected function', async () => {
    const { user, onEditPlugin } = setup();
    await user.click(
      screen.getByRole('button', {
        name: 'Edit Credential Plugin Configuration',
      })
    );
    expect(onEditPlugin).toHaveBeenCalledTimes(1);
  });
});
