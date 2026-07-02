import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import english from '../../../locales/en/messages';
import { ProjectsAPI } from 'api';
import ExecutionEnvironmentFileSelect from './ExecutionEnvironmentFileSelect';

i18n.load({ en: english.messages });
i18n.activate('en');

const renderWithI18n = (component) =>
  render(<I18nProvider i18n={i18n}>{component}</I18nProvider>);

jest.mock('api');

describe('<ExecutionEnvironmentFileSelect />', () => {
  beforeEach(() => {
    ProjectsAPI.readExecutionEnvironmentFiles.mockReturnValue({
      data: ['execution-environment.yml', 'nested/execution-environment.yaml'],
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should not fetch when no project is provided', async () => {
    renderWithI18n(
      <ExecutionEnvironmentFileSelect
        projectId={null}
        isValid
        onChange={() => {}}
        onError={() => {}}
      />
    );
    await waitFor(() =>
      expect(ProjectsAPI.readExecutionEnvironmentFiles).not.toHaveBeenCalled()
    );
  });

  test('should reload files when the project value changes', async () => {
    const { rerender } = renderWithI18n(
      <ExecutionEnvironmentFileSelect
        projectId={1}
        isValid
        onChange={() => {}}
        onError={() => {}}
      />
    );

    await waitFor(() =>
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalledWith(1)
    );

    rerender(
      <I18nProvider i18n={i18n}>
        <ExecutionEnvironmentFileSelect
          projectId={15}
          isValid
          onChange={() => {}}
          onError={() => {}}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalledTimes(2);
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalledWith(15);
    });
  });

  test('should trigger onChange for the selected option', async () => {
    const mockCallback = jest.fn();
    renderWithI18n(
      <ExecutionEnvironmentFileSelect
        projectId={1}
        isValid
        onChange={mockCallback}
        onError={() => {}}
      />
    );

    await waitFor(() =>
      expect(ProjectsAPI.readExecutionEnvironmentFiles).toHaveBeenCalledWith(1)
    );

    const input = screen.getByRole('textbox', {
      name: 'Select an execution environment file',
    });
    fireEvent.click(input);
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(2);
    });

    fireEvent.click(screen.getByText('execution-environment.yml'));
    expect(mockCallback).toHaveBeenCalledWith('execution-environment.yml');
  });

  test('should auto-select when only one file is available', async () => {
    ProjectsAPI.readExecutionEnvironmentFiles.mockReturnValue({
      data: ['execution-environment.yml'],
    });
    const mockCallback = jest.fn();
    renderWithI18n(
      <ExecutionEnvironmentFileSelect
        projectId={1}
        isValid
        onChange={mockCallback}
        onError={() => {}}
      />
    );

    await waitFor(() =>
      expect(mockCallback).toHaveBeenCalledWith('execution-environment.yml')
    );
  });
});
