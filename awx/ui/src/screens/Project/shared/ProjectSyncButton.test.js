import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ProjectSyncButton from './ProjectSyncButton';

jest.mock('../../../api');
jest.mock('hooks/useBrandName', () => ({
  __esModule: true,
  default: () => ({
    current: 'AWX',
  }),
}));

// ProjectSyncButton renders its own Sync button (aria-label "Sync Project")
// and does not render the children render-prop; the button's onClick drives
// the sync request directly.
const children = () => null;

describe('ProjectSyncButton', () => {
  test('renders the expected content', async () => {
    renderWithContexts(
      <ProjectSyncButton projectId={1}>{children}</ProjectSyncButton>
    );
    expect(
      screen.getByRole('button', { name: 'Sync Project' })
    ).toBeInTheDocument();
  });

  test('correct api calls are made on sync', async () => {
    ProjectsAPI.sync.mockResolvedValue({
      data: {
        id: 9000,
      },
    });
    const { user } = renderWithContexts(
      <ProjectSyncButton projectId={1}>{children}</ProjectSyncButton>
    );

    await user.click(screen.getByRole('button', { name: 'Sync Project' }));

    expect(ProjectsAPI.sync).toHaveBeenCalledWith(1);
  });

  test('disables sync button when last job is running', async () => {
    renderWithContexts(
      <ProjectSyncButton projectId={1} lastJobStatus="running">
        {children}
      </ProjectSyncButton>
    );

    expect(screen.getByRole('button', { name: 'Sync Project' })).toBeDisabled();
  });

  test('shows an explanatory tooltip on disabled sync', async () => {
    const { user } = renderWithContexts(
      <ProjectSyncButton projectId={1} lastJobStatus="running">
        {children}
      </ProjectSyncButton>
    );

    const button = screen.getByRole('button', { name: 'Sync Project' });
    expect(button).toBeDisabled();

    // hovering the disabled button reveals the explanatory Tooltip, which is
    // only rendered on the disabled (running) path
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  test('displays error modal after unsuccessful sync', async () => {
    ProjectsAPI.sync.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/projects/1/update',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <ProjectSyncButton projectId={1}>{children}</ProjectSyncButton>
    );

    expect(screen.queryByText('Error!')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sync Project' }));

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
