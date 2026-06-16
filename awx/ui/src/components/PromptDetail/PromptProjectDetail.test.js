import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import PromptProjectDetail from './PromptProjectDetail';
import mockProject from './data.project.json';

describe('PromptProjectDetail', () => {
  const config = {
    project_base_dir: 'dir/foo/bar',
  };

  test('should render expected details', () => {
    renderWithContexts(
      <PromptProjectDetail
        resource={{ ...mockProject, scm_track_submodules: true }}
      />,
      {
        context: { config },
      }
    );

    assertDetail('Source Control Type', 'Git');
    assertDetail(
      'Source Control URL',
      'https://github.com/ansible/ansible-tower-samples'
    );
    assertDetail('Source Control Branch', 'foo');
    assertDetail('Source Control Refspec', 'refs/');
    assertDetail('Cache Timeout', '3 Seconds');
    assertDetail('Project Base Path', 'dir/foo/bar');
    assertDetail('Playbook Directory', '_6__demo_project');
    assertDetail('Source Control Credential', 'Scm: mock scm');
    assertDetail(
      'Default Execution Environment',
      mockProject.summary_fields.default_environment.name
    );

    // Enabled Options renders one <li> per enabled flag
    expect(
      screen.getByText('Discard local changes before syncing')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Delete the project before syncing')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Track submodules latest commit on branch')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Update revision on job launch')
    ).toBeInTheDocument();
    expect(screen.getByText('Allow branch override')).toBeInTheDocument();
  });

  test('should render "Deleted" details', () => {
    delete mockProject.summary_fields.organization;
    renderWithContexts(<PromptProjectDetail resource={mockProject} />, {
      context: { config },
    });
    assertDetail('Organization', 'Deleted');
  });
});
