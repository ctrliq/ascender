import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RevertFormActionGroup from './RevertFormActionGroup';

describe('RevertFormActionGroup', () => {
  test('should render the expected content', () => {
    renderWithContexts(
      <RevertFormActionGroup
        onSubmit={() => {}}
        onCancel={() => {}}
        onRevert={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Revert all to default' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  test('should call the expected handlers on click', async () => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const onRevert = jest.fn();
    const { user } = renderWithContexts(
      <RevertFormActionGroup
        onSubmit={onSubmit}
        onCancel={onCancel}
        onRevert={onRevert}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
