import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { ProjectsAPI } from 'api';
import { messages as englishMessages } from '../../../locales/en/messages';
import PlaybookSelect from './PlaybookSelect';

// Setup i18n for tests
i18n.load({ en: englishMessages });
i18n.activate('en');

// Custom render function with I18n context
const renderWithI18n = (component: Untyped) =>
  render(<I18nProvider i18n={i18n}>{component}</I18nProvider>);

vi.mock('api');

describe('<PlaybookSelect />', () => {
  beforeEach(() => {
    vi.mocked(ProjectsAPI.readPlaybooks).mockResolvedValue({
      data: ['debug.yml', 'test.yml'],
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('should reload playbooks when project value changes', async () => {
    const { rerender } = renderWithI18n(
      <PlaybookSelect
        projectId={1}
        isValid
        onChange={() => {}}
        onError={() => {}}
      />
    );

    await waitFor(() => {
      expect(ProjectsAPI.readPlaybooks).toHaveBeenCalledWith(1);
    });

    rerender(
      <I18nProvider i18n={i18n}>
        <PlaybookSelect
          projectId={15}
          isValid
          onChange={() => {}}
          onError={() => {}}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(ProjectsAPI.readPlaybooks).toHaveBeenCalledTimes(2);
      expect(ProjectsAPI.readPlaybooks).toHaveBeenCalledWith(15);
    });
  });

  test('should trigger the onChange callback for the option selected from the list', async () => {
    const mockCallback = vi.fn();

    renderWithI18n(
      <PlaybookSelect
        projectId={1}
        isValid
        onChange={mockCallback}
        onError={() => {}}
      />
    );

    await waitFor(() => {
      expect(ProjectsAPI.readPlaybooks).toHaveBeenCalledWith(1);
    });

    const input = screen.getByRole('textbox', { name: 'Select a playbook' });
    fireEvent.click(input);
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(2);
    });

    fireEvent.click(screen.getByText('debug.yml'));
    expect(mockCallback).toHaveBeenCalledWith('debug.yml');
  });

  test('should allow entering playbook file name manually', async () => {
    const mockCallback = vi.fn();

    renderWithI18n(
      <PlaybookSelect
        projectId={1}
        isValid
        onChange={mockCallback}
        onError={() => {}}
      />
    );

    await waitFor(() => {
      expect(ProjectsAPI.readPlaybooks).toHaveBeenCalledWith(1);
    });

    const input = screen.getByRole('textbox', { name: 'Select a playbook' });
    fireEvent.change(input, { target: { value: 'foo.yml' } });

    await waitFor(() => {
      // The creatable option shows 'foo.yml' as plain text
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(1);
      expect(options[0]).toHaveTextContent('foo.yml');
    });

    fireEvent.click(screen.getByRole('option', { name: 'foo.yml' }));
    expect(mockCallback).toHaveBeenCalledWith('foo.yml');
  });
});
