import React from 'react';
import { FormRoot } from 'components/Form';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import EulaStep from './EulaStep';

describe('<EulaStep />', () => {
  test('initially renders the expected content', () => {
    renderWithContexts(
      <FormRoot
        onSubmit={() => {}}
        initialValues={{
          insights: false,
          manifest_file: null,
          manifest_filename: '',
          pendo: false,
          subscription: null,
          password: '',
          username: '',
        }}
      >
        <EulaStep />
      </FormRoot>
    );
    expect(screen.getByText('End User License Agreement')).toBeInTheDocument();
  });
});
