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
      <Formik onSubmit={() => {}} initialValues={{ job_type: 'run' }}>
        <OtherPromptsStep
          launchConfig={{
            ask_job_type_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const select = container.querySelector(
      'select#prompt-job-type'
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options).toHaveLength(3);
    expect(select.value).toEqual('run');
  });

  test('should render limit field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OtherPromptsStep
          launchConfig={{
            ask_limit_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-limit') as HTMLElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'limit');
  });

  test('should render timeout field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OtherPromptsStep
          launchConfig={{
            ask_timeout_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector(
      'input#prompt-timeout'
    ) as HTMLElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'timeout');
  });

  test('should render forks field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OtherPromptsStep
          launchConfig={{
            ask_forks_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector('input#prompt-forks') as HTMLElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'forks');
  });

  test('should render job slicing field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OtherPromptsStep
          launchConfig={{
            ask_job_slice_count_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector(
      'input#prompt-job-slicing'
    ) as HTMLElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'job_slice_count');
  });

  test('should render source control branch field', () => {
    const { container } = renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OtherPromptsStep
          launchConfig={{
            ask_scm_branch_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const input = container.querySelector(
      'input#prompt-scm-branch'
    ) as HTMLElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('name', 'scm_branch');
  });

  test('should render verbosity field', () => {
    const { container } = renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ verbosity: '' }}>
        <OtherPromptsStep
          launchConfig={{
            ask_verbosity_on_launch: true,
            ...jobTemplateData,
          }}
        />
      </Formik>
    );

    const select = container.querySelector(
      'select#prompt-verbosity'
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options).toHaveLength(6);
  });

  test('should render show changes toggle', () => {
    renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ diff_mode: true }}>
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
    // VariablesField does an async Formik update on mount; findBy settles it
    // inside act so the console-error trap stays quiet.
    renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={{ extra_vars: '{}' }}>
        <OtherPromptsStep
          variablesMode="javascript"
          onVarModeChange={vi.fn()}
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
