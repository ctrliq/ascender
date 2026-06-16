import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RevertAllAlert from './RevertAllAlert';

describe('RevertAllAlert', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <RevertAllAlert onClose={() => {}} onRevertAll={() => {}} />
    );
    expect(screen.getByText('Revert settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm revert all')).toBeInTheDocument();
    expect(screen.getByLabelText('Cancel revert')).toBeInTheDocument();
  });

  test('calls onRevertAll when confirm is clicked', async () => {
    const onRevertAll = jest.fn();
    const { user } = renderWithContexts(
      <RevertAllAlert onClose={() => {}} onRevertAll={onRevertAll} />
    );
    await user.click(screen.getByLabelText('Confirm revert all'));
    expect(onRevertAll).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when cancel is clicked', async () => {
    const onClose = jest.fn();
    const { user } = renderWithContexts(
      <RevertAllAlert onClose={onClose} onRevertAll={() => {}} />
    );
    await user.click(screen.getByLabelText('Cancel revert'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
