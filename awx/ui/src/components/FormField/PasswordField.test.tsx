import React from 'react';
import { screen } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PasswordField from './PasswordField';

describe('PasswordField', () => {
  test('renders the expected content', () => {
    const { container } = renderWithContexts(
      <FormRoot
        initialValues={{
          password: '',
        }}
        onSubmit={() => {}}
      >
        {() => (
          <PasswordField id="test-password" name="password" label="Password" />
        )}
      </FormRoot>
    );
    expect(container.querySelector('#test-password')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
  });
});
