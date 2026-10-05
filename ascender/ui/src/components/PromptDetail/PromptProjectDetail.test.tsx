import type { Project } from 'types/api';
import React from 'react';
import { screen, within } from '@testing-library/react';
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
        resource={
          { ...mockProject, scm_track_submodules: true } as unknown as Project
        }
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
    assertDetail('Source Control Branch/Tag/Commit', 'foo');
    assertDetail('Source Control Refspec', 'refs/');
    assertDetail('Cache Timeout', '3 seconds');
    assertDetail('Project Base Path', 'dir/foo/bar');
    assertDetail('Playbook Directory', '_6__demo_project');
    assertDetail('Source Control Credential', 'Scm: mock scm');
    assertDetail(
      'Default Execution Environment',
      mockProject.summary_fields.default_environment.name
    );

    // Options renders one <li> per enabled flag, named as on the form
    expect(
      within(screen.getByText('Options').nextElementSibling as HTMLElement)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'Clean',
      'Delete',
      'Track Submodules',
      'Update Revision on Launch',
      'Allow Branch Override',
    ]);
  });

  test('should render "Deleted" details', () => {
    const deletedProject = {
      ...mockProject,
      summary_fields: { ...mockProject.summary_fields },
    };
    delete (deletedProject.summary_fields as Record<string, unknown>)
      .organization;
    renderWithContexts(
      <PromptProjectDetail resource={deletedProject as unknown as Project} />,
      {
        context: { config },
      }
    );
    assertDetail('Organization', 'Deleted');
  });
});
