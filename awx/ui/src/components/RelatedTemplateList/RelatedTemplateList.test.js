import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import RelatedTemplateList from './RelatedTemplateList';

jest.mock('../../api');

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
        delete: false,
      },
    },
  },
];

function rowCheckbox(name) {
  const row = screen.getByText(name).closest('tr');
  return within(row).getByRole('checkbox');
}

describe('<RelatedTemplateList />', () => {
  let debug;
  beforeEach(() => {
    JobTemplatesAPI.read.mockResolvedValue({
      data: {
        count: mockTemplates.length,
        results: mockTemplates,
      },
    });

    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: [],
      },
    });
    debug = global.console.debug;
    global.console.debug = () => {};
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.console.debug = debug;
  });

  test('Templates are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );

    await screen.findByText('Job Template 1');

    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
      credentials__id: 1,
      order_by: 'name',
      page: 1,
      page_size: 20,
    });
    mockTemplates.forEach((tmpl) => {
      expect(screen.getByText(tmpl.name)).toBeInTheDocument();
    });
  });

  test('handleSelect is called when a template list item is selected', async () => {
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 2');

    const checkbox = rowCheckbox('Job Template 2');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(rowCheckbox('Job Template 2')).toBeChecked();
  });

  test('handleSelectAll is called when select all is checked', async () => {
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 1');

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    expect(selectAll).not.toBeChecked();

    await user.click(selectAll);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
    mockTemplates.forEach((tmpl) => {
      expect(rowCheckbox(tmpl.name)).toBeChecked();
    });
  });

  test('delete button is disabled if user does not have delete capabilities on a selected template', async () => {
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 1');

    // with a delete-capable template selected, Delete is enabled
    await user.click(rowCheckbox('Job Template 1'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();

    // adding a template without delete capability disables Delete
    await user.click(rowCheckbox('Job Template 3'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('api is called to delete templates for each selected template.', async () => {
    JobTemplatesAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 2');

    await user.click(rowCheckbox('Job Template 2'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(JobTemplatesAPI.destroy).toHaveBeenCalledWith(2)
    );
  });

  test('error is shown when template not successfully deleted from api', async () => {
    JobTemplatesAPI.destroy.mockRejectedValue(new Error());
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 1');
    expect(JobTemplatesAPI.read).toHaveBeenCalledTimes(1);

    await user.click(rowCheckbox('Job Template 1'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should properly copy template', async () => {
    JobTemplatesAPI.copy.mockResolvedValue({});
    const { user } = renderWithContexts(
      <RelatedTemplateList searchParams={{ credentials__id: 1 }} />
    );
    await screen.findByText('Job Template 1');

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(JobTemplatesAPI.copy).toHaveBeenCalled());
  });
});
