import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import About from './About';

jest.mock('../../hooks/useBrandName', () => ({
  __esModule: true,
  default: () => 'AWX',
}));

describe('<About />', () => {
  test('should render AboutModal with product name and version', () => {
    const onClose = jest.fn();
    renderWithContexts(<About isOpen onClose={onClose} version="1.2.3" />);

    // AboutModal renders into a body portal; the product name surfaces as the
    // dialog's accessible name.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('AWX')).toBeInTheDocument();

    // The version is rendered inside the speech-bubble <pre>.
    const pre = dialog.querySelector('pre');
    expect(pre.textContent).toContain('AWX 1.2.3');
  });

  test('should not render when isOpen is false', () => {
    const onClose = jest.fn();
    renderWithContexts(<About onClose={onClose} version="1.2.3" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
