import { createMemoryHistory } from 'history';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import {
  JobTemplatesAPI,
  UnifiedJobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../testUtils/rtlContexts';

import TemplateList from './TemplateList';

vi.mock('../../api');

const mockTemplates = [
  {
    id: 1,
    name: 'Job Template 1',
    url: '/templates/job_template/1',
    type: 'job_template',
    summary_fields: {
      user_capabilities: {
        delete: true,
        edit: true,
        copy: true,
      },
    },
  },
  {
    id: 2,
    name: 'Job Template 2',
    url: '/templates/job_template/2',
    type: 'job_template',
    summary_fields: {
      user_capabilities: {
        delete: true,
      },
    },
  },
  {
    id: 3,
    name: 'Job Template 3',
    url: '/templates/job_template/3',
    type: 'job_template',
    summary_fields: {
      user_capabilities: {
        delete: true,
      },
    },
  },
  {
    id: 4,
    name: 'Workflow Job Template 1',
    url: '/templates/workflow_job_template/4',
    type: 'workflow_job_template',
    summary_fields: {
      user_capabilities: {
        delete: true,
      },
    },
  },
  {
    id: 5,
    name: 'Workflow Job Template 2',
    url: '/templates/workflow_job_template/5',
    type: 'workflow_job_template',
    summary_fields: {
      user_capabilities: {
        delete: false,
      },
    },
  },
];

function getRow(name: string) {
  return screen.getByRole('link', { name }).closest('tr');
}

describe('<TemplateList />', () => {
  let debug: typeof global.console.debug;
  beforeEach(() => {
    // Deleting one row first counts what depends on it, through one read
    // per related endpoint. Nothing here depends on the row being deleted.
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: {
        count: mockTemplates.length,
        results: mockTemplates,
      },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);

    vi.mocked(UnifiedJobTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: [],
      },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.readOptions>);
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: {} },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
    vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: {} },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readOptions>);
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.console.debug = debug;
  });

  test('initially renders successfully', async () => {
    renderWithContexts(
      <TemplateList
        match={{ path: '/templates', url: '/templates' }}
        location={{ search: '', pathname: '/templates' }}
      />
    );
    await screen.findByRole('link', { name: 'Job Template 1' });
  });

  test('Templates are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 1' });
    expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled();
    // five name links, one per TemplateListItem
    expect(screen.getAllByRole('link', { name: /Job Template/ })).toHaveLength(
      5
    );
  });

  test('handleSelect is called when a template list item is selected', async () => {
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 2' });

    const checkbox = within(getRow('Job Template 2')!).getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('handleSelectAll is called when a template list item is selected', async () => {
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 1' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    expect(selectAll).not.toBeChecked();
    await user.click(selectAll);
    expect(selectAll).toBeChecked();
  });

  test('delete button is disabled if user does not have delete capabilities on a selected template', async () => {
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 1' });

    const deleteableCheckbox = within(getRow('Job Template 1')!).getByRole(
      'checkbox'
    );
    const nonDeleteableCheckbox = within(
      getRow('Workflow Job Template 2')!
    ).getByRole('checkbox');

    // select a deleteable template -> Delete enabled
    await user.click(deleteableCheckbox);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();

    // deselect it -> Delete disabled (nothing selected)
    await user.click(deleteableCheckbox);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    // select a non-deleteable template -> Delete disabled
    await user.click(nonDeleteableCheckbox);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('api is called to delete templates for each selected template.', async () => {
    vi.mocked(JobTemplatesAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof JobTemplatesAPI.destroy>
    );
    vi.mocked(WorkflowJobTemplatesAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.destroy>
    );
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 2' });

    await user.click(within(getRow('Job Template 2')!).getByRole('checkbox'));
    await user.click(
      within(getRow('Workflow Job Template 1')!).getByRole('checkbox')
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(JobTemplatesAPI.destroy).toHaveBeenCalledWith(2)
    );
    expect(WorkflowJobTemplatesAPI.destroy).toHaveBeenCalledWith(4);
  });

  test('error is shown when template not successfully deleted from api', async () => {
    vi.mocked(JobTemplatesAPI.destroy).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/job_templates/1',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 2' });

    await user.click(within(getRow('Job Template 2')!).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    const errorTitle = await screen.findByText('Error!');

    // The deletion-error AlertModal stacks over the still-closing confirm
    // modal, so the error dialog's subtree is aria-hidden and getByRole can't
    // reach its Close button; scope the query to the error dialog instead.
    const errorDialog = errorTitle.closest('.pf-v6-c-modal-box');
    await user.click(
      within(errorDialog as unknown as HTMLElement).getByLabelText('Close')
    );
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('should properly copy template', async () => {
    vi.mocked(JobTemplatesAPI.copy).mockResolvedValue({
      status: 201,
      data: { id: 6 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.copy>);
    const { user } = renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 1' });

    // only Job Template 1 has copy capability
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(JobTemplatesAPI.copy).toHaveBeenCalled());
    expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled();
  });
  /*
   * The tabs are the type filter. They are only offered where the list stands
   * on its own: embedded in the dashboard it sits inside a tab already, and a
   * second row of them under the first reads as a mistake.
   */
  test('should offer a tab for each kind, and none where it is embedded', async () => {
    const { unmount } = renderWithContexts(<TemplateList hasTypeTabs />);
    await screen.findByRole('link', { name: 'Job Template 1' });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'All',
      'Job Templates',
      'Workflow Templates',
    ]);

    unmount();
    renderWithContexts(<TemplateList />);
    await screen.findByRole('link', { name: 'Job Template 1' });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  test('should narrow the list to one kind from its tab', async () => {
    const { user, history } = renderWithContexts(<TemplateList hasTypeTabs />);
    await screen.findByRole('link', { name: 'Job Template 1' });

    await user.click(screen.getByRole('tab', { name: 'Workflow Templates' }));

    // in the query string like every other filter, so the tab survives a
    // reload and the back button walks back through it
    await waitFor(() =>
      expect(history.location.search).toContain(
        'template.type=workflow_job_template'
      )
    );
    await waitFor(() =>
      expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow_job_template' })
      )
    );
  });

  test('should drop a type search when a tab takes over the type', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/templates?template.type=job_template&template.or__type=workflow_job_template',
      ],
    });
    const { user } = renderWithContexts(<TemplateList hasTypeTabs />, {
      context: { router: { history } },
    });
    await screen.findByRole('link', { name: 'Job Template 1' });

    await user.click(screen.getByRole('tab', { name: 'Job Templates' }));

    await waitFor(() =>
      expect(history.location.search).not.toContain('or__type')
    );
  });

  /*
   * The add button on a tab has one thing to add, so it goes straight there
   * rather than opening a menu to ask which of the two.
   */
  test('should add straight to the kind its tab holds', async () => {
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: {} } },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
    vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: {} } },
    } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readOptions>);
    const history = createMemoryHistory({
      initialEntries: ['/templates?template.type=workflow_job_template'],
    });
    renderWithContexts(<TemplateList hasTypeTabs />, {
      context: { router: { history } },
    });
    await screen.findByRole('link', { name: 'Job Template 1' });

    expect(screen.getByRole('link', { name: /add/i })).toHaveAttribute(
      'href',
      '/templates/workflow_job_template/add/'
    );
  });
});
