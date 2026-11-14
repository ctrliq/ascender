import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HealthCheckButton from './HealthCheckButton';

function renderButton(selectedItems: unknown[], isDisabled: boolean) {
  return renderWithContexts(
    <HealthCheckButton
      isDisabled={isDisabled}
      onClick={() => {}}
      selectedItems={selectedItems}
      healthCheckPending={false}
    />
  );
}

describe('<HealthCheckButton />', () => {
  test('asks for a selection when nothing is ticked', async () => {
    const { user } = renderButton([], true);
    const button = screen.getByRole('button', { name: 'Run Health Check' });
    expect(button).toBeDisabled();
    await user.hover(button.closest('div')!);
    expect(
      await screen.findByText('Select an instance to run a health check.')
    ).toBeInTheDocument();
  });

  test('says why a selection without an execution node cannot be checked', async () => {
    const { user } = renderButton(
      [
        { id: 1, node_type: 'control' },
        { id: 2, node_type: 'hop' },
      ],
      true
    );
    await user.hover(
      screen.getByRole('button', { name: 'Run Health Check' }).closest('div')!
    );
    expect(
      await screen.findByText(
        'Health checks can only be run on execution nodes.'
      )
    ).toBeInTheDocument();
  });

  test('invites the check once an execution node is ticked', async () => {
    const { user } = renderButton(
      [
        { id: 1, node_type: 'execution' },
        { id: 2, node_type: 'control' },
      ],
      false
    );
    const button = screen.getByRole('button', { name: 'Run Health Check' });
    expect(button).toBeEnabled();
    await user.hover(button.closest('div')!);
    expect(
      await screen.findByText(
        'Click to run a health check on the selected instances.'
      )
    ).toBeInTheDocument();
  });
});
