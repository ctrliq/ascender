import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Wizard from './Wizard';

describe('Wizard', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <Wizard
        title="Simple Wizard"
        steps={[{ name: 'Step 1', component: <p>Step 1</p> }]}
      />
    );
    // The wizard renders its first step's content (the <p>) plus nav entries
    // that also read "Step 1"; the content paragraph is the unique <p>.
    expect(screen.getByText('Step 1', { selector: 'p' })).toBeInTheDocument();
    // The step's nav button is present and active.
    expect(screen.getByRole('button', { name: 'Step 1' })).toBeInTheDocument();
  });

  describe('Escape', () => {
    const renderOpen = (onClose: () => void) =>
      renderWithContexts(
        <Wizard
          isOpen
          title="A wizard"
          onClose={onClose}
          steps={[{ id: 'one', name: 'One', component: <p>Step one</p> }]}
        />
      );

    afterEach(() => {
      document.querySelector('#open-menu')?.remove();
    });

    test('closes the wizard when nothing inside it is open', () => {
      const onClose = vi.fn();
      renderOpen(onClose);
      fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 27 });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('leaves the wizard open while a menu inside it is open', () => {
      const onClose = vi.fn();
      renderOpen(onClose);
      // A dropdown's menu, open when the key is pressed: the key is its.
      const menu = document.createElement('div');
      menu.id = 'open-menu';
      menu.className = 'pf-v6-c-menu';
      document.body.appendChild(menu);

      fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 27 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
