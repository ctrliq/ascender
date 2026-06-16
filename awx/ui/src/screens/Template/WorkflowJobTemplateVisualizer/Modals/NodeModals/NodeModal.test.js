import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { useUserProfile } from 'contexts/Config';
import {
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeModal from './NodeModal';

jest.mock('../../../../../api');
const dispatch = jest.fn();
const onSave = jest.fn();

// The PF Wizard renders into a body portal; these helpers query the live DOM
// (screen/document) rather than an enzyme wrapper.
const nextButton = () => document.querySelector('button#next-node-modal');
const clickNext = () => fireEvent.click(nextButton());
const selectNodeType = (value) =>
  fireEvent.change(document.querySelector('#nodeResource-select'), {
    target: { value },
  });
const clickFirstResource = () =>
  fireEvent.click(document.querySelector('td#check-action-item-1 input'));

// SelectableCard does not forward its id to the DOM; the cards are
// role="button" elements distinguished by their bold label text.
const clickLinkTypeCard = (label) => {
  const card = [...document.querySelectorAll('[role="button"]')].find(
    (el) => el.querySelector('b')?.textContent === label
  );
  fireEvent.click(card);
};

const waitForWizard = () =>
  waitFor(() =>
    expect(document.querySelector('button#next-node-modal')).toBeInTheDocument()
  );

const jtLaunchConfig = {
  can_start_without_user_input: false,
  passwords_needed_to_start: [],
  ask_scm_branch_on_launch: false,
  ask_variables_on_launch: true,
  ask_tags_on_launch: true,
  ask_diff_mode_on_launch: true,
  ask_skip_tags_on_launch: true,
  ask_job_type_on_launch: true,
  ask_limit_on_launch: false,
  ask_verbosity_on_launch: true,
  ask_inventory_on_launch: true,
  ask_credential_on_launch: true,
  survey_enabled: true,
  variables_needed_to_start: ['a'],
  credential_needed_to_start: false,
  inventory_needed_to_start: false,
  job_template_data: {
    name: 'A User-2 has admin permission',
    id: 25,
    description: '',
  },
  defaults: {
    extra_vars: '---',
    diff_mode: false,
    limit: '',
    job_tags: '',
    skip_tags: '',
    job_type: 'run',
    verbosity: 0,
    inventory: {
      name: ' Inventory 1 Org 0',
      id: 1,
    },
    credentials: [
      {
        id: 2,
        name: ' Credential 2 User 1',
        credential_type: 1,
        passwords_needed: [],
      },
      {
        id: 8,
        name: 'vault cred',
        credential_type: 3,
        passwords_needed: [],
        vault_id: '',
      },
    ],
    scm_branch: '',
  },
};

const mockJobTemplate = {
  id: 1,
  name: 'Test Job Template',
  type: 'job_template',
  url: '/api/v2/job_templates/1',
  summary_fields: {
    inventory: {
      name: 'Foo Inv',
      id: 1,
    },
    recent_jobs: [],
  },
  related: { webhook_receiver: '' },
  inventory: 1,
  project: 5,
};

describe('NodeModal', () => {
  beforeEach(async () => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
    JobTemplatesAPI.read = jest.fn();
    JobTemplatesAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [mockJobTemplate],
      },
    });
    JobTemplatesAPI.readOptions = jest.fn();
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    JobTemplatesAPI.readLaunch = jest.fn();
    JobTemplatesAPI.readLaunch.mockResolvedValue({ data: jtLaunchConfig });
    JobTemplatesAPI.readCredentials = jest.fn();
    JobTemplatesAPI.readCredentials.mockResolvedValue({
      data: {
        results: [],
      },
    });
    JobTemplatesAPI.readSurvey = jest.fn();
    JobTemplatesAPI.readSurvey.mockResolvedValue({
      data: {
        name: '',
        description: '',
        spec: [
          {
            question_name: 'Foo',
            required: true,
            variable: 'bar',
            type: 'text',
            default: 'answer',
          },
        ],
        type: 'text',
        variable: 'bar',
      },
    });
    ProjectsAPI.read = jest.fn();
    ProjectsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Project',
            type: 'project',
            url: '/api/v2/projects/1',
          },
        ],
      },
    });
    ProjectsAPI.readOptions = jest.fn();
    ProjectsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    InventorySourcesAPI.read = jest.fn();
    InventorySourcesAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Inventory Source',
            type: 'inventory_source',
            url: '/api/v2/inventory_sources/1',
          },
        ],
      },
    });
    InventorySourcesAPI.readOptions = jest.fn();
    InventorySourcesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    WorkflowJobTemplatesAPI.read = async () => ({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Workflow Job Template',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/1',
          },
        ],
      },
    });
    WorkflowJobTemplatesAPI.readOptions = async () => ({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    WorkflowJobTemplatesAPI.readLaunch = async () => ({
      data: {
        ask_inventory_on_launch: false,
        ask_limit_on_launch: false,
        ask_scm_branch_on_launch: false,
        can_start_without_user_input: false,
        defaults: {
          extra_vars: '---',
          inventory: {
            name: null,
            id: null,
          },
          limit: '',
          scm_branch: '',
        },
        survey_enabled: false,
        variables_needed_to_start: [],
        node_templates_missing: [],
        node_prompts_rejected: [272, 273],
        workflow_job_template_data: {
          name: 'jt',
          id: 53,
          description: '',
        },
        ask_variables_on_launch: false,
      },
    });
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{
            nodeToEdit: null,
          }}
        >
          <NodeModal
            askLinkType
            onSave={onSave}
            title="Add Node"
            resourceDefaultCredentials={[]}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    await waitForWizard();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Can successfully create a new job template node', async () => {
    clickLinkTypeCard('Always');
    clickNext();
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeInTheDocument()
    );
    clickFirstResource();
    await waitFor(() =>
      expect(document.querySelector('td#check-action-item-1 input')).toBeChecked()
    );
    clickNext();

    await waitFor(() => {
      expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(1);
    });
    expect(JobTemplatesAPI.readCredentials).toHaveBeenCalledWith(1, {
      page_size: 200,
    });
    expect(JobTemplatesAPI.readSurvey).toHaveBeenCalledWith(25);

    // Jump to the preview step via the wizard nav, then save.
    await waitFor(() =>
      expect(document.querySelector('#preview-step')).toBeInTheDocument()
    );
    fireEvent.click(document.querySelector('#preview-step'));
    await waitFor(() => expect(nextButton()).toHaveTextContent('Save'));
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          linkType: 'always',
          nodeType: 'job_template',
          inventory: { name: 'Foo Inv', id: 1 },
          credentials: [],
          job_type: '',
          verbosity: '0',
          job_tags: '',
          skip_tags: '',
          diff_mode: false,
          survey_bar: 'answer',
          nodeResource: mockJobTemplate,
          extra_data: { bar: 'answer' },
        },
        jtLaunchConfig
      );
    });
  });

  test('Can successfully create a new project sync node', async () => {
    clickLinkTypeCard('On Failure');
    clickNext();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toBeInTheDocument()
    );
    selectNodeType('project');
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeInTheDocument()
    );
    clickFirstResource();
    await waitFor(() =>
      expect(document.querySelector('td#check-action-item-1 input')).toBeChecked()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          linkType: 'failure',
          nodeResource: {
            id: 1,
            name: 'Test Project',
            type: 'project',
            url: '/api/v2/projects/1',
          },
          nodeType: 'project',
          verbosity: undefined,
        },
        {}
      );
    });
  });

  test('Can successfully create a new inventory source sync node', async () => {
    clickLinkTypeCard('On Failure');
    clickNext();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toBeInTheDocument()
    );
    selectNodeType('inventory_source');
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeInTheDocument()
    );
    clickFirstResource();
    await waitFor(() =>
      expect(document.querySelector('td#check-action-item-1 input')).toBeChecked()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          linkType: 'failure',
          nodeResource: {
            id: 1,
            name: 'Test Inventory Source',
            type: 'inventory_source',
            url: '/api/v2/inventory_sources/1',
          },
          nodeType: 'inventory_source',
          verbosity: undefined,
        },
        {}
      );
    });
  });

  test('Can successfully create a new workflow job template node', async () => {
    clickNext();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toBeInTheDocument()
    );
    selectNodeType('workflow_job_template');
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeInTheDocument()
    );
    clickFirstResource();
    await waitFor(() =>
      expect(document.querySelector('td#check-action-item-1 input')).toBeChecked()
    );
    clickNext();
    await waitFor(() =>
      expect(nextButton()).not.toBeDisabled()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          linkType: 'success',
          nodeResource: {
            id: 1,
            name: 'Test Workflow Job Template',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/1',
          },
          nodeType: 'workflow_job_template',
          verbosity: undefined,
        },
        {
          ask_inventory_on_launch: false,
          ask_limit_on_launch: false,
          ask_scm_branch_on_launch: false,
          ask_variables_on_launch: false,
          can_start_without_user_input: false,
          defaults: {
            extra_vars: '---',
            inventory: { id: null, name: null },
            limit: '',
            scm_branch: '',
          },
          node_prompts_rejected: [272, 273],
          node_templates_missing: [],
          survey_enabled: false,
          variables_needed_to_start: [],
          workflow_job_template_data: { description: '', id: 53, name: 'jt' },
        }
      );
    });
  });

  test('Can successfully create a new approval template node', async () => {
    clickLinkTypeCard('Always');
    clickNext();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toBeInTheDocument()
    );
    selectNodeType('workflow_approval_template');
    await waitFor(() =>
      expect(document.querySelector('input#approval-name')).toBeInTheDocument()
    );

    fireEvent.change(document.querySelector('input#approval-name'), {
      target: { value: 'Test Approval', name: 'approvalName' },
    });
    fireEvent.change(document.querySelector('input#approval-description'), {
      target: { value: 'Test Approval Description', name: 'approvalDescription' },
    });
    fireEvent.change(document.querySelector('input#approval-timeout-minutes'), {
      target: { value: 5, name: 'timeoutMinutes' },
    });
    fireEvent.change(document.querySelector('input#approval-timeout-seconds'), {
      target: { value: 30, name: 'timeoutSeconds' },
    });

    expect(document.querySelector('input#approval-name')).toHaveValue(
      'Test Approval'
    );
    expect(document.querySelector('input#approval-description')).toHaveValue(
      'Test Approval Description'
    );
    expect(document.querySelector('input#approval-timeout-minutes')).toHaveValue(
      5
    );
    expect(document.querySelector('input#approval-timeout-seconds')).toHaveValue(
      30
    );

    clickNext();
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          approvalDescription: 'Test Approval Description',
          approvalName: 'Test Approval',
          linkType: 'always',
          nodeResource: null,
          nodeType: 'workflow_approval_template',
          timeoutMinutes: 5,
          timeoutSeconds: 30,
        },
        {}
      );
    });
  });

  test('Cancel button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#cancel-node-modal'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CANCEL_NODE_MODAL',
    });
  });
});

describe('Edit existing node', () => {
  beforeEach(() => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Can successfully change project sync node to workflow approval node', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{
            nodeToEdit: {
              id: 2,
              identifier: 'Foo',
              fullUnifiedJobTemplate: {
                id: 1,
                name: 'Test Project',
                type: 'project',
              },
            },
          }}
        >
          <NodeModal
            askLinkType={false}
            onSave={onSave}
            title="Edit Node"
            resourceDefaultCredentials={[]}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    await waitForWizard();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toHaveValue(
        'project'
      )
    );
    selectNodeType('workflow_approval_template');
    await waitFor(() =>
      expect(document.querySelector('input#approval-name')).toBeInTheDocument()
    );

    fireEvent.change(document.querySelector('input#approval-name'), {
      target: { value: 'Test Approval', name: 'approvalName' },
    });
    fireEvent.change(document.querySelector('input#approval-description'), {
      target: { value: 'Test Approval Description', name: 'approvalDescription' },
    });
    fireEvent.change(document.querySelector('input#approval-timeout-minutes'), {
      target: { value: 5, name: 'timeoutMinutes' },
    });
    fireEvent.change(document.querySelector('input#approval-timeout-seconds'), {
      target: { value: 30, name: 'timeoutSeconds' },
    });

    expect(document.querySelector('input#approval-name')).toHaveValue(
      'Test Approval'
    );
    expect(document.querySelector('input#approval-description')).toHaveValue(
      'Test Approval Description'
    );
    expect(document.querySelector('input#approval-timeout-minutes')).toHaveValue(
      5
    );
    expect(document.querySelector('input#approval-timeout-seconds')).toHaveValue(
      30
    );

    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          identifier: 'Foo',
          approvalDescription: 'Test Approval Description',
          approvalName: 'Test Approval',
          linkType: 'success',
          nodeResource: null,
          nodeType: 'workflow_approval_template',
          timeoutMinutes: 5,
          timeoutSeconds: 30,
        },
        {}
      );
    });
  });

  test('Can successfully change approval node to workflow job template node', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={{
            nodeToEdit: {
              id: 2,
              identifier: 'Foo',
              fullUnifiedJobTemplate: {
                id: 1,
                name: 'Test Approval',
                description: 'Test Approval Description',
                type: 'workflow_approval_template',
                timeout: 0,
              },
            },
          }}
        >
          <NodeModal
            askLinkType={false}
            onSave={onSave}
            title="Edit Node"
            resourceDefaultCredentials={[]}
          />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    await waitForWizard();
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toHaveValue(
        'workflow_approval_template'
      )
    );
    selectNodeType('workflow_job_template');
    await waitFor(() =>
      expect(document.querySelector('#nodeResource-select')).toHaveValue(
        'workflow_job_template'
      )
    );
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeInTheDocument()
    );
    clickFirstResource();
    await waitFor(() =>
      expect(document.querySelector('td#check-action-item-1 input')).toBeChecked()
    );
    clickNext();
    await waitFor(() =>
      expect(nextButton()).not.toBeDisabled()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          identifier: 'Foo',
          linkType: 'success',
          nodeResource: {
            id: 1,
            name: 'Test Workflow Job Template',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/1',
          },
          nodeType: 'workflow_job_template',
        },
        {
          ask_inventory_on_launch: false,
          ask_limit_on_launch: false,
          ask_scm_branch_on_launch: false,
          ask_variables_on_launch: false,
          can_start_without_user_input: false,
          defaults: {
            extra_vars: '---',
            inventory: { id: null, name: null },
            limit: '',
            scm_branch: '',
          },
          node_prompts_rejected: [272, 273],
          node_templates_missing: [],
          survey_enabled: false,
          variables_needed_to_start: [],
          workflow_job_template_data: { description: '', id: 53, name: 'jt' },
        }
      );
    });
  });
});
