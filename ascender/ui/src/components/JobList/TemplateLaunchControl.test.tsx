import type { LaunchableResource } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TemplateLaunchControl from './TemplateLaunchControl';

vi.mock('../../api');

const template = (start: boolean, type = 'job_template') =>
  ({
    id: 7,
    type,
    name: 'deploy',
    summary_fields: { user_capabilities: { start } },
  }) as unknown as LaunchableResource & { id: number };

describe('<TemplateLaunchControl />', () => {
  test('says Run, and on hover what running launches', async () => {
    const { user } = renderWithContexts(
      <TemplateLaunchControl template={template(true)} />
    );

    const run = screen.getByRole('button', { name: 'Run' });
    await user.hover(run);
    expect(await screen.findByText('Run Job Template')).toBeInTheDocument();
  });

  test('names a workflow as a workflow', async () => {
    const { user } = renderWithContexts(
      <TemplateLaunchControl
        template={template(true, 'workflow_job_template')}
      />
    );

    await user.hover(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByText('Run Workflow Template')
    ).toBeInTheDocument();
  });

  test('offers nothing to somebody who may not launch the template', () => {
    renderWithContexts(<TemplateLaunchControl template={template(false)} />);

    expect(
      screen.queryByRole('button', { name: 'Run' })
    ).not.toBeInTheDocument();
  });
});
