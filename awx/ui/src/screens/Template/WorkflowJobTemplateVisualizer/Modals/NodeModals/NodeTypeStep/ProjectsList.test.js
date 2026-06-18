import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../../../../testUtils/rtlContexts';
import ProjectsList from './ProjectsList';

jest.mock('../../../../../../api/models/Projects');

const nodeResource = {
  id: 1,
  name: 'Test Project',
  unified_job_type: 'project_update',
};
const onUpdateNodeResource = jest.fn();

describe('ProjectsList', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Row selected when nodeResource id matches row id and clicking new row makes expected callback', async () => {
    ProjectsAPI.read.mockResolvedValueOnce({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'Test Project',
            type: 'project',
            url: '/api/v2/projects/1',
          },
          {
            id: 2,
            name: 'Test Project 2',
            type: 'project',
            url: '/api/v2/projects/2',
          },
        ],
      },
    });
    ProjectsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <ProjectsList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    const row1 = screen.getByRole('row', { name: /Test Project$/ });
    const row2 = screen.getByRole('row', { name: /Test Project 2/ });
    expect(within(row1).getByRole('radio')).toBeChecked();
    expect(within(row2).getByRole('radio')).not.toBeChecked();

    fireEvent.click(within(row2).getByRole('radio'));
    expect(onUpdateNodeResource).toHaveBeenCalledWith({
      id: 2,
      name: 'Test Project 2',
      type: 'project',
      url: '/api/v2/projects/2',
    });
  });

  test('Error shown when read() request errors', async () => {
    ProjectsAPI.read.mockRejectedValue(new Error());
    renderWithContexts(
      <ProjectsList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
