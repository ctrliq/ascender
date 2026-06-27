import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import OtherPromptsStep from './OtherPromptsStep';

const jobTemplateData = {
  job_template_data: {
    name: 'Demo Job Template',
    id: 1,
    description: '',
  },
};

describe('OtherPromptsStep', () => {
  // FormField/FormGroup labelIcon (the tooltip) breaks the label/input
  // association, so query inputs and selects by id from the container.
  test('should render job type field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{ job_type: 'run' }}>
        <OtherPromptsStep
          launchConfig={{
            ask_job_type_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const select = container.querySelector('select#prompt-job-type');
    expect(select).not.toBeNull();
    expect(select.options).toHaveLength(3);
    expect(select.value).toEqual('run');
  });

  test('should render limit field', () => {
    const { container } = renderWithContexts(
      <Formik>
        <OtherPromptsStep
          launchConfig={{
            ask_limit_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-limit');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'limit');
  });

  test('should render timeout field', () => {
    const { container } = renderWithContexts(
      <Formik>
        <OtherPromptsStep
          launchConfig={{
            ask_timeout_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-timeout');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'timeout');
  });

  test('should render forks field', () => {
    const { container } = renderWithContexts(
      <Formik>
        <OtherPromptsStep
          launchConfig={{
            ask_forks_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-forks');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'forks');
  });

  test('should render job slicing field', () => {
    const { container } = renderWithContexts(
      <Formik>
        <OtherPromptsStep
          launchConfig={{
            ask_job_slice_count_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-job-slicing');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'job_slice_count');
  });

  test('should render source control branch field', () => {
    const { container } = renderWithContexts(
      <Formik>
        <OtherPromptsStep
          launchConfig={{
            ask_scm_branch_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-scm-branch');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'scm_branch');
  });

  test('should render verbosity field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{ verbosity: '' }}>
        <OtherPromptsStep
          launchConfig={{
            ask_verbosity_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const select = container.querySelector('select#prompt-verbosity');
    expect(select).not.toBeNull();
    expect(select.options).toHaveLength(6);
  });

  test('should render show changes toggle', () => {
    renderWithContexts(
      <Formik initialValues={{ diff_mode: true }}>
        <OtherPromptsStep
          launchConfig={{
            ask_diff_mode_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const toggle = screen.getByRole('switch', { name: 'On' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  test('should render variables field', async () => {
    // react-ace renders empty under jsdom, so assert the surrounding label.
    // VariablesField does an async Formik update on mount; findBy settles it
    // inside act so the console-error trap stays quiet.
    renderWithContexts(
      <Formik initialValues={{ extra_vars: '{}' }}>
        <OtherPromptsStep
          variablesMode="javascript"
          onVarModeChange={jest.fn()}
          launchConfig={{
            ask_variables_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    expect(await screen.findByText('Variables')).toBeInTheDocument();
  });
});
