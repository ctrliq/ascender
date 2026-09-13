import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PasswordInput from './PasswordInput';

function renderInput() {
  return renderWithContexts(
    <Formik
      initialValues={{
        password: '',
      }}
      onSubmit={() => {}}
    >
      {() => (
        <PasswordInput id="test-password" name="password" label="Password" />
      )}
    </Formik>
  );
}

describe('PasswordInput', () => {
  test('renders the expected content', () => {
    const { container } = renderInput();
    expect(container.querySelector('#test-password')).toBeInTheDocument();
  });

  test('properly responds to show/hide toggles', async () => {
    const { container, user } = renderInput();
    const input = container.querySelector('#test-password');
    const toggle = screen.getByRole('button', { name: 'Toggle Password' });
    // masked state: input type=password
    expect(input).toHaveAttribute('type', 'password');

    // toggling reveals the value (input type flips to text) and back; assert
    // the user-visible behavior rather than the icon's svg path (which is a
    // brittle @patternfly/react-icons implementation detail)
    await user.click(toggle);
    await waitFor(() =>
      expect(container.querySelector('#test-password')).toHaveAttribute(
        'type',
        'text'
      )
    );

    await user.click(toggle);
    await waitFor(() =>
      expect(container.querySelector('#test-password')).toHaveAttribute(
        'type',
        'password'
      )
    );
  });
});
