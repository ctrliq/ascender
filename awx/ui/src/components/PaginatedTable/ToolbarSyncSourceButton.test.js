import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ToolbarSyncSourceButton from './ToolbarSyncSourceButton';

describe('<ToolbarSyncSourceButton />', () => {
  test('should render button and invoke onClick', async () => {
    const onClick = jest.fn();
    const { user } = renderWithContexts(
      <ToolbarSyncSourceButton onClick={onClick} />
    );
    const button = screen.getByRole('button', { name: 'Sync all' });
    await user.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
