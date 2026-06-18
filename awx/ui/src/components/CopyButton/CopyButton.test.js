import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CopyButton from './CopyButton';

jest.mock('../../api');

describe('<CopyButton/>', () => {
  test('should mount properly', () => {
    renderWithContexts(
      <CopyButton
        onCopyStart={() => {}}
        onCopyFinish={() => {}}
        copyItem={() => {}}
        errorMessage="Failed to copy template."
      />
    );
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  test('should call copyItem on button click', async () => {
    const copyItem = jest.fn();
    const { user } = renderWithContexts(
      <CopyButton
        onCopyStart={() => {}}
        onCopyFinish={() => {}}
        copyItem={copyItem}
        errorMessage="Failed to copy template."
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyItem).toHaveBeenCalledTimes(1);
  });
});
