import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ToolbarAddButton from './ToolbarAddButton';

describe('<ToolbarAddButton />', () => {
  test('should render button', async () => {
    const onClick = jest.fn();
    const { user } = renderWithContexts(<ToolbarAddButton onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  test('should render link', () => {
    renderWithContexts(<ToolbarAddButton linkTo="/foo" />);
    const link = screen.getByRole('link', { name: 'Add' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/foo');
  });

  test('should render toggle button with toggle icon', () => {
    const onClick = jest.fn();
    renderWithContexts(
      <ToolbarAddButton showToggleIndicator onClick={onClick} />
    );
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toBeInTheDocument();
  });
});
