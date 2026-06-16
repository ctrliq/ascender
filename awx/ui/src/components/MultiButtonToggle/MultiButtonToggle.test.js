import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MultiButtonToggle from './MultiButtonToggle';

describe('<MultiButtonToggle />', () => {
  const onChange = jest.fn();

  const renderToggle = (value = 'yaml') =>
    render(
      <MultiButtonToggle
        buttons={[
          ['yaml', 'YAML'],
          ['json', 'JSON'],
        ]}
        value={value}
        onChange={onChange}
        name="the-button"
      />
    );

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render buttons successfully', () => {
    renderToggle();
    const yamlButton = screen.getByRole('button', { name: 'YAML' });
    const jsonButton = screen.getByRole('button', { name: 'JSON' });
    // variant="primary" renders the pf-m-primary modifier; "secondary" the pf-m-secondary one
    expect(yamlButton).toHaveClass('pf-m-primary');
    expect(jsonButton).toHaveClass('pf-m-secondary');
  });

  it('should call onChange function when button clicked', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(onChange).toHaveBeenCalledWith('json');
  });
});
