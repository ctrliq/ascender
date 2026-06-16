import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import BecomeMethodField from './BecomeMethodField';

const fieldOptions = {
  help_text:
    "Specify a method for 'become' operations. This is equivalent to specifying the --become-method Ansible parameter.",
  id: 'become_method',
  label: 'Privilege Escalation Method',
  type: 'string',
};

describe('<BecomeMethodField>', () => {
  test('should mount properly', () => {
    renderWithContexts(
      <Formik>
        <BecomeMethodField fieldOptions={fieldOptions} isRequired />
      </Formik>
    );
    expect(
      screen.getByText('Privilege Escalation Method')
    ).toBeInTheDocument();
  });

  test('should open privilege escalation properly', async () => {
    const { user } = renderWithContexts(
      <Formik>
        <BecomeMethodField fieldOptions={fieldOptions} isRequired />
      </Formik>
    );
    await user.click(
      screen.getByRole('button', { name: 'Options menu' })
    );
    expect(screen.getAllByRole('option')).toHaveLength(12);
  });
});
