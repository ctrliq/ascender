import React from 'react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { messages as englishMessages } from '../../../locales/en/messages.mjs';
import '@testing-library/jest-dom';
import { settleTooltips } from '../../../../testUtils/rtlContexts';
import ConstructedInventoryHint from './ConstructedInventoryHint';

vi.mock('../../../api');
// Only useConfig is replaced: rtlContexts, imported above for settleTooltips,
// reads ConfigProvider off the same module at import time.
vi.mock('contexts/Config', async (importOriginal) => ({
  ...(await importOriginal()),
  useConfig: () => ({
    custom_base_path: '',
    version: '1.0.0',
  }),
}));

describe('<ConstructedInventoryHint />', () => {
  beforeEach(() => {
    i18n.load({ en: englishMessages });
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
    vi.spyOn(navigator.clipboard, 'writeText');

    render(
      <I18nProvider i18n={i18n}>
        <ConstructedInventoryHint />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Info alert details' }));

    // Wait for the expandable content to be visible
    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    // Find and expand the FormFieldGroupExpandable sections that hold the
    // sample plugin code blocks.
    const allButtons = screen.getAllByRole('button');

    // Look for buttons that contain text related to our examples
    const expandableButtons = allButtons.filter((button) => {
      const text = button.textContent || '';
      return (
        text.includes('processor') ||
        text.includes('Processor') ||
        text.includes('Construct') ||
        text.includes('Hosts by')
      );
    });

    if (expandableButtons.length === 0) {
      // Fall back to any collapsed expandable button (aria-expanded="false")
      allButtons
        .filter(
          (button) =>
            button.hasAttribute('aria-expanded') &&
            button.getAttribute('aria-expanded') === 'false'
        )
        .forEach((button) => fireEvent.click(button));
    } else {
      // Click the processor-related button
      fireEvent.click(expandableButtons[0]!);
    }

    // Now find a copy button and confirm it writes to the clipboard
    const copyButtons = await screen.findAllByRole('button', {
      name: /copy/i,
    });
    fireEvent.click(copyButtons[0]!);
    await settleTooltips();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
