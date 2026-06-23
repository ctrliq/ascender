import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
	DropdownItem
} from '@patternfly/react-core/deprecated';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AddDropDownButton from './AddDropDownButton';

describe('<AddDropDownButton />', () => {
  const dropdownItems = [
    <DropdownItem key="add">Add</DropdownItem>,
    <DropdownItem key="route">Route</DropdownItem>,
  ];

  test('should be closed initially', () => {
    renderWithContexts(<AddDropDownButton dropdownItems={dropdownItems} />);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  test('should render the dropdown items when opened', async () => {
    const { user } = renderWithContexts(
      <AddDropDownButton dropdownItems={dropdownItems} />
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.getAllByRole('menuitem')).toHaveLength(dropdownItems.length)
    );
  });

  test('should close when button re-clicked', async () => {
    const { user } = renderWithContexts(
      <AddDropDownButton dropdownItems={dropdownItems} />
    );
    const toggle = screen.getByRole('button', { name: 'Add' });
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.getAllByRole('menuitem')).toHaveLength(dropdownItems.length)
    );
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    );
  });
});
