import React from 'react';
import { screen } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import type { LaunchableResource, WorkflowJobTemplate } from 'types/api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import useOtherPromptsStep from './useOtherPromptsStep';

const launchConfig = {
  ask_limit_on_launch: true,
  job_template_data: {
    name: 'Demo Job Template',
    id: 1,
    description: '',
  },
};

const jobTemplate = { id: 1, name: 'Demo Job Template', type: 'job_template' };

const workflow = (limit: string | null) =>
  ({ id: 7, name: 'Nightly', limit }) as unknown as WorkflowJobTemplate;

function Step({
  resource,
  workflowTemplate,
}: {
  resource: LaunchableResource;
  workflowTemplate: WorkflowJobTemplate | null;
}) {
  const { step } = useOtherPromptsStep(
    launchConfig,
    resource,
    [],
    workflowTemplate
  );
  return <>{step?.component}</>;
}

const renderStep = (
  resource: LaunchableResource,
  workflowTemplate: WorkflowJobTemplate | null = null
) =>
  renderWithContexts(
    <FormRoot initialValues={{ limit: '' }} onSubmit={() => {}}>
      <Step resource={resource} workflowTemplate={workflowTemplate} />
    </FormRoot>
  );

const nodeWarning = /This workflow \(Nightly\) sets its own limit/;
const workflowWarning = /applied to all workflow nodes within this workflow/;

describe('useOtherPromptsStep limit warning', () => {
  test('warns on a node whose workflow sets a limit', () => {
    renderStep(jobTemplate, workflow('!disabled'));

    expect(screen.getByText(nodeWarning)).toBeInTheDocument();
  });

  test('warns on a node whose workflow sets a blank limit', () => {
    renderStep(jobTemplate, workflow(''));

    expect(screen.getByText(nodeWarning)).toBeInTheDocument();
  });

  test('does not warn on a node whose workflow has no limit', () => {
    renderStep(jobTemplate, workflow(null));

    expect(screen.queryByText(nodeWarning)).not.toBeInTheDocument();
    expect(screen.queryByText(workflowWarning)).not.toBeInTheDocument();
  });

  test('does not warn when launching a job template', () => {
    renderStep(jobTemplate);

    expect(screen.queryByText(nodeWarning)).not.toBeInTheDocument();
    expect(screen.queryByText(workflowWarning)).not.toBeInTheDocument();
  });

  test('warns that a workflow limit applies to its nodes', () => {
    renderStep({ id: 7, name: 'Nightly', type: 'workflow_job_template' });

    expect(
      screen.getByText(
        /applied to all workflow nodes within this workflow \(Nightly\)/
      )
    ).toBeInTheDocument();
  });

  test('a nested workflow under a workflow with a limit gets only the outer warning', () => {
    renderStep(
      { id: 8, name: 'Inner', type: 'workflow_job_template' },
      workflow('!disabled')
    );

    expect(screen.getByText(nodeWarning)).toBeInTheDocument();
    expect(screen.queryByText(workflowWarning)).not.toBeInTheDocument();
  });
});
