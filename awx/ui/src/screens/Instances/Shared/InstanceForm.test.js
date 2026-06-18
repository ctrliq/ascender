import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceForm from './InstanceForm';

jest.mock('../../../api');

describe('<InstanceForm />', () => {
  test('should display form fields properly', () => {
    renderWithContexts(
      <InstanceForm
        handleCancel={() => {}}
        handleSubmit={() => {}}
        submitError={null}
      />
    );

    expect(screen.getByText('Host Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Instance State')).toBeInTheDocument();
    expect(screen.getByText('Listener Port')).toBeInTheDocument();
    expect(screen.getByText('Instance Type')).toBeInTheDocument();
  });

  test('should update form values', async () => {
    const { user, container } = renderWithContexts(
      <InstanceForm
        handleCancel={() => {}}
        handleSubmit={() => {}}
        submitError={null}
      />
    );

    const hostnameInput = container.querySelector('input#hostname');
    await user.clear(hostnameInput);
    await user.type(hostnameInput, 'new Foo');
    expect(hostnameInput).toHaveValue('new Foo');
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = jest.fn();
    const { user } = renderWithContexts(
      <InstanceForm
        handleCancel={handleCancel}
        handleSubmit={() => {}}
        submitError={null}
      />
    );

    expect(handleCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });

  test('should call handleSubmit when Save button is clicked', async () => {
    const handleSubmit = jest.fn();
    const { user, container } = renderWithContexts(
      <InstanceForm
        handleCancel={() => {}}
        handleSubmit={handleSubmit}
        submitError={null}
      />
    );

    expect(handleSubmit).not.toHaveBeenCalled();

    const hostnameInput = container.querySelector('input#hostname');
    await user.clear(hostnameInput);
    await user.type(hostnameInput, 'new Foo');

    const descriptionInput = container.querySelector(
      'input#instance-description'
    );
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'This is a repeat song');

    // Instance State field is always disabled
    expect(container.querySelector('input#instance-state')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(handleSubmit).toHaveBeenCalledWith({
        description: 'This is a repeat song',
        enabled: true,
        managed_by_policy: true,
        hostname: 'new Foo',
        node_state: 'installed',
        node_type: 'execution',
        peers_from_control_nodes: false,
        peers: [],
      })
    );
  });
});
