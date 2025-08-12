import React from 'react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { en } from 'make-plural/plurals';
import english from '../../../locales/en/messages';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConstructedInventoryHint from './ConstructedInventoryHint';

jest.mock('../../../api');
jest.mock('contexts/Config', () => ({
  useConfig: () => ({
    custom_base_path: '',
    version: '1.0.0',
  }),
}));

describe('<ConstructedInventoryHint />', () => {
  beforeEach(() => {
    i18n.loadLocaleData({ en: { plurals: en } });
    i18n.load({ en: english });
    i18n.activate('en');
  });

  test('should render link to docs', () => {
    render(
      <I18nProvider i18n={i18n}>
        <ConstructedInventoryHint />
      </I18nProvider>
    );
    expect(
      screen.getByRole('link', {
        name: 'View constructed inventory documentation here',
      })
    ).toBeInTheDocument();
  });

  test('should expand hint details', () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ConstructedInventoryHint />
      </I18nProvider>
    );

    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(container.querySelector('code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Info alert details' }));
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('code')).toBeInTheDocument();
  });

  test('should copy sample plugin code block', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: () => {},
      },
    });
    jest.spyOn(navigator.clipboard, 'writeText');

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ConstructedInventoryHint />
      </I18nProvider>
    );
    
    fireEvent.click(screen.getByRole('button', { name: 'Info alert details' }));
    
    // Wait for the expandable content to be visible
    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    // Now we need to find and expand the FormFieldGroupExpandable sections
    // Let's look for buttons that might expand these sections
    const allButtons = screen.getAllByRole('button');

    // Look for buttons that contain text related to our examples
    const expandableButtons = allButtons.filter(button => {
      const text = button.textContent || '';
      return text.includes('processor') || text.includes('Processor') || 
             text.includes('Construct') || text.includes('Hosts by');
    });

    if (expandableButtons.length === 0) {
      // If we can't find specific buttons, try to find any button that might expand form field groups
      // Look for buttons with aria-expanded attribute
      const expandableAriaButtons = allButtons.filter(button => 
        button.hasAttribute('aria-expanded') && button.getAttribute('aria-expanded') === 'false'
      );
      
      // Try clicking all expandable buttons to see if they reveal our content
      for (const button of expandableAriaButtons) {
        fireEvent.click(button);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      }
    } else {
      // Click the processor-related button
      fireEvent.click(expandableButtons[0]);
    }

    // Now check for copy buttons again
    await waitFor(() => {
      const copyButtons = screen.queryAllByRole('button', { name: /copy/i });
      
      if (copyButtons.length > 0) {
        fireEvent.click(copyButtons[0]);
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      } else {
        throw new Error('Still no copy buttons found after trying to expand sections');
      }
    });
  });
});