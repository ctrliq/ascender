import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { WorkflowJobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../../../../testUtils/rtlContexts';
import WorkflowJobTemplatesList from './WorkflowJobTemplatesList';

vi.mock('../../../../../../api/models/WorkflowJobTemplates');

const nodeResource = {
  id: 1,
  name: 'Test Workflow Job Template',
  unified_job_type: 'workflow_job',
};
const onUpdateNodeResource = vi.fn();

describe('WorkflowJobTemplatesList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Row selected when nodeResource id matches row id and clicking new row makes expected callback', async () => {
    vi.mocked(WorkflowJobTemplatesAPI.read).mockResolvedValueOnce({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'Test Workflow Job Template',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/1',
          },
          {
            id: 2,
            name: 'Test Workflow Job Template 2',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/2',
          },
        ],
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(
      <WorkflowJobTemplatesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    const row1 = screen.getByRole('row', {
      name: /Test Workflow Job Template$/,
    });
    const row2 = screen.getByRole('row', {
      name: /Test Workflow Job Template 2/,
    });
    expect(within(row1).getByRole('radio')).toBeChecked();
    expect(within(row2).getByRole('radio')).not.toBeChecked();

    fireEvent.click(within(row2).getByRole('radio'));
    expect(onUpdateNodeResource).toHaveBeenCalledWith({
      id: 2,
      name: 'Test Workflow Job Template 2',
      type: 'workflow_job_template',
      url: '/api/v2/workflow_job_templates/2',
    });
  });

  test('Error shown when read() request errors', async () => {
    vi.mocked(WorkflowJobTemplatesAPI.read).mockRejectedValue(new Error());
    renderWithContexts(
      <WorkflowJobTemplatesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
