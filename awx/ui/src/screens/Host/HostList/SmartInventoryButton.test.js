import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SmartInventoryButton from './SmartInventoryButton';

describe('<SmartInventoryButton />', () => {
  test('should render button', async () => {
    const onClick = jest.fn();
    const { user } = renderWithContexts(
      <SmartInventoryButton onClick={onClick} />
    );
    const button = screen.getByRole('button', { name: 'Smart Inventory' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});
