import React from 'react';

import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '@testing-library/react';
import { JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockJobTemplateData from './data.job_template.json';
import TemplateListItem from './TemplateListItem';

jest.mock('../../api');

function renderItem(ui, options) {
  return renderWithContexts(
    <table>
      <tbody>{ui}</tbody>
    </table>,
    options
  );
}

describe('<TemplateListItem />', () => {
  test('should display expected data', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            organization: {
              id: 1,
              name: 'Foo',
            },
            user_capabilities: {
              start: true,
            },
            recent_jobs: [
              {
                id: 123,
                name: 'Template 1',
                status: 'failed',
                finished: '2020-02-26T22:38:41.037991Z',
              },
            ],
          },
        }}
      />
    );
    const nameCell = screen.getByText('Template 1').closest('td');
    expect(nameCell).toHaveAttribute('data-label', 'Name');

    const typeCell = screen.getByText('Job Template').closest('td');
    expect(typeCell).toHaveAttribute('data-label', 'Type');

    // Organization detail only renders in the expanded section; the row itself
    // surfaces Name, Type and Last Ran. Assert the Last Ran cell value here and
    // cover the Organization Link in the expanded-section test below.
    const lastRanCell = screen
      .getByText('2/26/2020, 10:38:41 PM')
      .closest('td');
    expect(lastRanCell).toHaveAttribute('data-label', 'Last Ran');
  });

  test('launch button shown to users with start capabilities', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              start: true,
            },
          },
        }}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Launch template' })
    ).toBeInTheDocument();
  });

  test('launch button hidden from users without start capabilities', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              start: false,
            },
          },
        }}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Launch template' })
    ).not.toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              edit: true,
            },
          },
        }}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Edit Template' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
          },
        }}
      />
    );
    expect(
      screen.queryByRole('link', { name: 'Edit Template' })
    ).not.toBeInTheDocument();
  });

  test('missing resource icon is shown.', () => {
    const { container } = renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
          },
        }}
      />
    );
    // ExclamationTriangleIcon renders as an svg inside the Name cell tooltip
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(
      screen.getByText('Template 1').closest('td').querySelector('svg')
    ).toBeInTheDocument();
  });

  test('missing resource icon is not shown when there is a project and an inventory.', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
            project: { name: 'Foo', id: 2 },
            inventory: { name: 'Bar', id: 2 },
          },
        }}
      />
    );
    expect(
      screen.getByText('Template 1').closest('td').querySelector('svg')
    ).not.toBeInTheDocument();
  });

  test('missing resource icon is not shown when inventory is prompt_on_launch, and a project', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'job_template',
          ask_inventory_on_launch: true,
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
            project: { name: 'Foo', id: 2 },
          },
        }}
      />
    );
    expect(
      screen.getByText('Template 1').closest('td').querySelector('svg')
    ).not.toBeInTheDocument();
  });

  test('missing resource icon is not shown type is workflow_job_template', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        template={{
          id: 1,
          name: 'Template 1',
          url: '/templates/job_template/1',
          type: 'workflow_job_template',
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
          },
        }}
      />
    );
    expect(
      screen.getByText('Template 1').closest('td').querySelector('svg')
    ).not.toBeInTheDocument();
  });

  test('clicking on template from templates list navigates properly', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates'],
    });
    const { user } = renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={{
          id: 1,
          name: 'Template 1',
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
          },
        }}
      />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('link', { name: 'Template 1' }));
    expect(history.location.pathname).toEqual(
      '/templates/job_template/1/details'
    );
  });

  test('should call api to copy template', async () => {
    JobTemplatesAPI.copy.mockResolvedValue({});

    const { user } = renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={mockJobTemplateData}
        onCopy={() => {}}
        fetchTemplates={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(JobTemplatesAPI.copy).toHaveBeenCalled());
    jest.clearAllMocks();
  });

  test('should render proper alert modal on copy error', async () => {
    JobTemplatesAPI.copy.mockRejectedValue(new Error());

    const { user } = renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={mockJobTemplateData}
        onCopy={() => {}}
        fetchTemplates={() => {}}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    jest.clearAllMocks();
  });

  test('should not render copy button', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={{
          ...mockJobTemplateData,
          summary_fields: { user_capabilities: { copy: false } },
        }}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });

  test('should render visualizer button for workflow', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={{
          ...mockJobTemplateData,
          type: 'workflow_job_template',
        }}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Visualizer' })
    ).toBeInTheDocument();
  });

  test('should not render visualizer button for job template', () => {
    renderItem(
      <TemplateListItem
        isSelected={false}
        detailUrl="/templates/job_template/1/details"
        template={mockJobTemplateData}
      />
    );
    expect(
      screen.queryByRole('link', { name: 'Visualizer' })
    ).not.toBeInTheDocument();
  });

  test('should render expected details in expanded section', () => {
    const { container } = renderItem(
      <TemplateListItem
        isSelected={false}
        isExpanded
        detailUrl="/templates/job_template/1/details"
        template={{
          ...mockJobTemplateData,
          description: 'mock description',
        }}
      />
    );

    function assertDetail(label, value) {
      const term = screen.getByText(label);
      expect(term.nextElementSibling).toHaveTextContent(value);
    }

    assertDetail('Description', 'mock description');
    assertDetail('Inventory', "Mike's Inventory");
    assertDetail('Project', "Mike's Project");
    assertDetail('Execution Environment', 'Mock EE 1.2.3');

    // Organization Link in the expanded section (the Detail renders in the
    // expanded body).
    expect(
      screen.getByRole('link', { name: "Mike's Org" })
    ).toHaveAttribute('href', '/organizations/1/details');

    // Credentials chips
    const credentials = screen.getByText('Credentials').nextElementSibling;
    expect(within(credentials).getByText('SSH:')).toBeInTheDocument();
    expect(within(credentials).getByText('Credential 1')).toBeInTheDocument();
    expect(within(credentials).getByText('Awx:')).toBeInTheDocument();
    expect(within(credentials).getByText('Credential 2')).toBeInTheDocument();

    // Labels chips
    const labels = screen.getByText('Labels').nextElementSibling;
    expect(within(labels).getByText('L_91o2')).toBeInTheDocument();

    // Activity cell renders a Sparkline (svg) for the single recent job.
    // Asserts one Sparkline renders in the Activity cell.
    const activityCell = container.querySelector('[data-label="Activity"]');
    expect(activityCell).toBeInTheDocument();
    expect(activityCell.querySelector('svg')).toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    renderItem(
      <TemplateListItem
        isExpanded
        template={{
          ...mockJobTemplateData,
          summary_fields: {
            user_capabilities: {},
            credentials: [],
          },
        }}
      />
    );
    // Detail with isEmpty (empty credentials array) renders null, so the
    // Credentials label is absent from the DOM.
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  test('should not load Labels', () => {
    renderItem(
      <TemplateListItem
        isExpanded
        template={{
          ...mockJobTemplateData,
          summary_fields: {
            user_capabilities: {},
            labels: {
              results: [],
            },
          },
        }}
      />
    );
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });
});
