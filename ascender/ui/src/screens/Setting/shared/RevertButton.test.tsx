import React from 'react';
import { FormRoot } from 'components/Form';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RevertButton from './RevertButton';

// The tooltip's text, rendered in place: the real one only mounts after a
// hover and a delay, and what it says is all these tests are after.
vi.mock('components/Tooltip', () => ({
  default: ({
    content,
    children,
  }: {
    content: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {children}
      <span data-testid="tooltip">{content}</span>
    </>
  ),
}));

describe('RevertButton', () => {
  test('button text should display "Revert"', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="" />
      </FormRoot>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
  });

  test('button text should display "Revert" when default differs from value', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="bar" />
      </FormRoot>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
  });

  test('should revert value to default on button click', async () => {
    const { user } = renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="bar" />
      </FormRoot>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(screen.getByRole('button')).toHaveTextContent('Undo');
  });

  test('should be disabled when current value equals the initial and default values', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'bar' }}>
        <RevertButton id="test_input" defaultValue="bar" />
      </FormRoot>
    );
    expect(screen.getByRole('button')).toHaveTextContent('Revert');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('should say the setting matches its default when that is why it is disabled', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'bar' }}>
        <RevertButton id="test_input" defaultValue="bar" />
      </FormRoot>
    );
    expect(screen.getByTestId('tooltip')).toHaveTextContent(
      'Setting matches factory default.'
    );
  });

  test('should not claim the default when disabled for another reason', () => {
    renderWithContexts(
      <FormRoot onSubmit={() => {}} initialValues={{ test_input: 'foo' }}>
        <RevertButton id="test_input" defaultValue="bar" isDisabled />
      </FormRoot>
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByTestId('tooltip')).toHaveTextContent(
      'Revert is unavailable while the field is disabled.'
    );
  });
});
