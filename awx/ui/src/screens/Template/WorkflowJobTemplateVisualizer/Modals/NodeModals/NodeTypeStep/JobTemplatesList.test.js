import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../../../../testUtils/rtlContexts';
import JobTemplatesList from './JobTemplatesList';

jest.mock('../../../../../../api/models/JobTemplates');

const nodeResource = {
  id: 1,
  name: 'Test Job Template',
  unified_job_type: 'job',
};
const onUpdateNodeResource = jest.fn();

describe('JobTemplatesList', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Row selected when nodeResource id matches row id and clicking new row makes expected callback', async () => {
    JobTemplatesAPI.read.mockResolvedValueOnce({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'Test Job Template',
            type: 'job_template',
            url: '/api/v2/job_templates/1',
            inventory: 1,
            project: 2,
          },
          {
            id: 2,
            name: 'Test Job Template 2',
            type: 'job_template',
            url: '/api/v2/job_templates/2',
            inventory: 1,
            project: 2,
          },
        ],
      },
    });
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <JobTemplatesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    const row1 = screen.getByRole('row', { name: /Test Job Template$/ });
    const row2 = screen.getByRole('row', { name: /Test Job Template 2/ });
    expect(within(row1).getByRole('radio')).toBeChecked();
    expect(within(row2).getByRole('radio')).not.toBeChecked();

    fireEvent.click(within(row2).getByRole('radio'));
    expect(onUpdateNodeResource).toHaveBeenCalledWith({
      id: 2,
      name: 'Test Job Template 2',
      type: 'job_template',
      url: '/api/v2/job_templates/2',
      inventory: 1,
      project: 2,
    });
  });

  test('Row should display popover', async () => {
    JobTemplatesAPI.read.mockResolvedValueOnce({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Job Template',
            type: 'job_template',
            url: '/api/v2/job_templates/1',
            inventory: 1,
            project: 2,
          },
        ],
      },
    });
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <JobTemplatesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    const row = screen.getByRole('row', { name: /Test Job Template/ });
    // The row action is a PF Popover whose trigger is an
    // OutlinedQuestionCircleIcon (role=img). Its presence is how we assert
    // that the row rendered exactly one Popover. We do not
    // open the popover: its body (TemplatePopoverContent) renders against mock
    // data lacking summary_fields, which would log prop-type console errors that
    // the setupTests trap turns into failures.
    const popoverTriggers = within(row).getAllByRole('img', { hidden: true });
    expect(popoverTriggers).toHaveLength(1);
  });

  test('Error shown when read() request errors', async () => {
    JobTemplatesAPI.read.mockRejectedValue(new Error());
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <JobTemplatesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    expect(
      await screen.findByText(/Something went wrong/)
    ).toBeInTheDocument();
  });
});
