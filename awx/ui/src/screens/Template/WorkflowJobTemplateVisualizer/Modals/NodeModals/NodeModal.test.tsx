import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
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
import type { ResponseOf } from '../../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import NodeModal from './NodeModal';
import type { WorkflowState } from '../../../../../components/Workflow/workflowReducer';

// ---------------------------------------------------------------------------
// Mock ALL PatternFly packages to avoid loading the 308MB / 586-file PF6
// module tree.  The tests exercise wizard-step logic (navigation, API calls,
// save payloads), not PF component rendering, so lightweight stubs suffice.
// ---------------------------------------------------------------------------

vi.mock('@patternfly/react-core', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const WizCtx = R.createContext({});

  // Helper: strip PF-only props so React doesn't warn about unknown DOM attrs.
  const strip = (props: Untyped) => {
    const out: Untyped = {};
    const skip = new Set([
      'ouiaId',
      'validated',
      'dataLabel',
      'isFill',
      'isPlain',
      'isCompact',
      'isInline',
      'isExpanded',
      'isActive',
      'isAriaDisabled',
      'component',
      'variant',
      'hasNoPadding',
      'position',
      'appendTo',
      'modifier',
      'hasNoBodyWrapper',
      'showClose',
      'noPadding',
      'css',
      'bodyAriaLabel',
      'columnModifier',
      'isNavOpen',
      'navAriaLabel',
      'isOpen',
    ]);
    Object.entries(props).forEach(([k, v]) => {
      if (!skip.has(k)) out[k] = v;
    });
    return out;
  };

  const el = (tag: Untyped) =>
    R.forwardRef((props: Untyped, ref: Untyped) => {
      const { children, ...rest } = props;
      return R.createElement(tag, { ...strip(rest), ref }, children);
    });

  function MockWizard({
    children,
    onStepChange,
    onSave,
    onClose: _onClose,
    header,
    footer,
  }: Untyped) {
    const steps: Untyped[] = R.Children.toArray(children);
    const [idx, setIdx] = R.useState(0);
    const stepsRef = R.useRef(steps);
    const cbRef = R.useRef({ onStepChange, onSave });
    stepsRef.current = steps;
    cbRef.current = { onStepChange, onSave };

    const clamped = Math.min(idx, Math.max(0, steps.length - 1));
    const cur = steps[clamped];
    const curProps = cur?.props || {};

    const goToNextStep = R.useCallback(() => {
      setIdx((prev: Untyped) => {
        const s = stepsRef.current;
        if (prev + 1 >= s.length) {
          cbRef.current.onSave?.();
          return prev;
        }
        const ni = prev + 1;
        cbRef.current.onStepChange?.(
          {},
          { id: s[ni]?.props?.id, name: s[ni]?.props?.name },
          { id: s[prev]?.props?.id, name: s[prev]?.props?.name },
          'next'
        );
        return ni;
      });
    }, []);

    const goToPrevStep = R.useCallback(() => {
      setIdx((prev: Untyped) => {
        if (prev <= 0) return prev;
        const s = stepsRef.current;
        const ni = prev - 1;
        cbRef.current.onStepChange?.(
          {},
          { id: s[ni]?.props?.id, name: s[ni]?.props?.name },
          { id: s[prev]?.props?.id, name: s[prev]?.props?.name },
          'back'
        );
        return ni;
      });
    }, []);

    const ctx = R.useMemo(
      () => ({
        activeStep: { id: curProps.id, name: curProps.name },
        goToNextStep,
        goToPrevStep,
      }),
      [curProps.id, curProps.name, goToNextStep, goToPrevStep]
    );

    return R.createElement(
      WizCtx.Provider,
      { value: ctx },
      header,
      R.createElement(
        'nav',
        null,
        steps.map((s: Untyped, i: Untyped) =>
          R.createElement(
            'button',
            {
              key: s.props?.id ?? i,
              id: s.props?.id,
              type: 'button',
              onClick: () => {
                const p = stepsRef.current[clamped]?.props || {};
                cbRef.current.onStepChange?.(
                  {},
                  { id: s.props?.id, name: s.props?.name },
                  { id: p.id, name: p.name },
                  'nav'
                );
                setIdx(i);
              },
            },
            s.props?.name
          )
        )
      ),
      R.createElement('div', null, cur),
      footer
    );
  }

  const exps = {
    __esModule: true,
    Button: R.forwardRef(
      ({ children, isDisabled, ...props }: Untyped, ref: Untyped) =>
        R.createElement(
          'button',
          {
            ...strip(props),
            ref,
            type: 'button',
            disabled: isDisabled || false,
          },
          children
        )
    ),
    TextInput: el('input'),
    TextArea: el('textarea'),
    FormSelect: R.forwardRef(
      ({ children, onChange, ...props }: Untyped, ref: Untyped) =>
        R.createElement(
          'select',
          {
            ...strip(props),
            ref,
            onChange: (e: Untyped) => onChange?.(e, e.target.value),
          },
          children
        )
    ),
    FormSelectOption: ({ label, children, ...props }: Untyped) =>
      R.createElement('option', strip(props), children || label),
    Switch: (props: Untyped) =>
      R.createElement('input', { ...strip(props), type: 'checkbox' }),
    Checkbox: (props: Untyped) =>
      R.createElement('input', { ...strip(props), type: 'checkbox' }),
    Form: el('div'),
    Title: el('h2'),
    Tooltip: ({ children }: Untyped) => children || null,
    WizardFooterWrapper: el('div'),
    Wizard: MockWizard,
    WizardStep: el('div'),
    WizardHeader: el('div'),
    useWizardContext: () => R.useContext(WizCtx),
  };

  return new Proxy(exps as Untyped, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === '__esModule') return true;
      if (typeof p === 'string' && /^[A-Z]/.test(p)) {
        t[p] = el('div');
        return t[p];
      }
      if (typeof p === 'string' && p.startsWith('use')) {
        t[p] = () => ({});
        return t[p];
      }
      return undefined;
    },
  });
});

vi.mock('@patternfly/react-core/deprecated', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    Modal: ({ children, isOpen }: Untyped) =>
      isOpen ? R.createElement('div', null, children) : null,
    ModalVariant: { large: 'large', medium: 'medium', small: 'small' },
  };
});

vi.mock('@patternfly/react-table', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const strip = (props: Untyped) => {
    const out: Untyped = {};
    [
      'ouiaId',
      'dataLabel',
      'css',
      'modifier',
      'isStickyHeader',
      'isCompact',
      'variant',
    ].forEach((k) => delete props[k]);
    Object.entries(props).forEach(([k, v]) => {
      out[k] = v;
    });
    return out;
  };

  return {
    __esModule: true,
    Table: ({ children, ...p }: Untyped) =>
      R.createElement('table', strip(p), children),
    Thead: ({ children, ...p }: Untyped) =>
      R.createElement('thead', strip(p), children),
    Tbody: ({ children, ...p }: Untyped) =>
      R.createElement('tbody', strip(p), children),
    Tr: ({ children, ...p }: Untyped) =>
      R.createElement('tr', strip(p), children),
    Th: ({ children, ...p }: Untyped) =>
      R.createElement('th', strip(p), children),
    Td: ({ select, children, ...p }: Untyped) => {
      const cleaned = strip(p);
      if (select) {
        return R.createElement(
          'td',
          cleaned,
          R.createElement('input', {
            type: select.variant === 'radio' ? 'radio' : 'checkbox',
            checked: select.isSelected || false,
            onChange: select.onSelect || (() => {}),
          })
        );
      }
      return R.createElement('td', cleaned, children);
    },
  };
});

vi.mock('@patternfly/react-icons', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  // Every icon the modal reaches for is made on demand and remembered.
  return new Proxy({} as Untyped, {
    get(t: Untyped, p) {
      if (p === '__esModule') return true;
      // The factory is async, so its result gets awaited. Handing back a
      // function for `then` would make this namespace look like a thenable
      // and the await would never settle.
      if (p === 'then') return undefined;
      if (!(p in t) && typeof p === 'string') {
        t[p] = (props: Untyped) =>
          R.createElement('span', { 'data-icon': p, ...props });
      }
      return t[p];
    },
  });
});

// Suppress React DOM warnings caused by mock components (unknown props,
// nesting mismatches).  Real errors still propagate to setupTests.js.
const _origErr = console.error;
const _origWarn = console.warn;
const isReactDomNoise = (args: Untyped) => {
  const m = typeof args[0] === 'string' ? args[0] : '';
  return (
    m.includes('validateDOMNesting') ||
    m.includes('is not recognized') ||
    m.includes('React does not recognize') ||
    m.includes('Invalid DOM property') ||
    m.includes('Invalid value for prop') ||
    m.includes('Unknown event handler') ||
    m.includes('Each child in a list') ||
    m.includes('not a supported value') ||
    m.includes('on a DOM element') ||
    m.includes('Received `true` for') ||
    m.includes('Received `false` for')
  );
};
beforeAll(() => {
  console.error = (...args) => {
    if (!isReactDomNoise(args)) _origErr(...args);
  };
  console.warn = (...args) => {
    if (!isReactDomNoise(args)) _origWarn(...args);
  };
});
afterAll(() => {
  console.error = _origErr;
  console.warn = _origWarn;
});

vi.mock('../../../../../api');
const dispatch = vi.fn();
const onSave = vi.fn();

// The PF Wizard renders into a body portal; these helpers query the live DOM
// (screen/document) directly.
const nextButton = () => document.querySelector('button#next-node-modal');
const clickNext = () => fireEvent.click(nextButton()!);
const selectNodeType = (value: Untyped) =>
  fireEvent.change(document.querySelector('#nodeResource-select')!, {
    target: { value },
  });
const clickFirstResource = () =>
  fireEvent.click(document.querySelector('td#check-action-item-1 input')!);

// Changing the node type refetches the list, and the rows of the previous type
// stay mounted while it does, so waiting for the checkbox selector alone is
// satisfied by a row that is about to be replaced: the click then lands on a
// detached input and the selection never happens. Waiting for a row of the
// type just chosen is what says the new list is there.
const waitForResource = (name: string) =>
  waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());

// SelectableCard does not forward its id to the DOM; the cards are
// role="button" elements distinguished by their bold label text.
const clickLinkTypeCard = (label: Untyped) => {
  const card = [...document.querySelectorAll('[role="button"]')].find(
    (el) => el.querySelector('b')?.textContent === label
  );
  fireEvent.click(card!);
};

const waitForWizard = async () => {
  await waitFor(() =>
    expect(document.querySelector('button#next-node-modal')).toBeInTheDocument()
  );
  // The button existing is not the same as the wizard having settled. Without
  // this the first interaction of a test can land on a render that is then
  // replaced, and be silently lost, which shows up as the click that picked a
  // link type never having happened.
  await act(async () => {});
};

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
    vi.mocked(useUserProfile).mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: 0,
      isNotificationAdmin: 0,
      isExecEnvAdmin: 0,
    }));
    (JobTemplatesAPI as Untyped).read = vi.fn();
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [mockJobTemplate],
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    (JobTemplatesAPI as Untyped).readOptions = vi.fn();
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
    (JobTemplatesAPI as Untyped).readLaunch = vi.fn();
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: jtLaunchConfig,
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    (JobTemplatesAPI as Untyped).readCredentials = vi.fn();
    vi.mocked(JobTemplatesAPI.readCredentials).mockResolvedValue({
      data: {
        results: [],
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readCredentials>);
    (JobTemplatesAPI as Untyped).readSurvey = vi.fn();
    vi.mocked(JobTemplatesAPI.readSurvey).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readSurvey>);
    (ProjectsAPI as Untyped).read = vi.fn();
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof ProjectsAPI.read>);
    (ProjectsAPI as Untyped).readOptions = vi.fn();
    vi.mocked(ProjectsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof ProjectsAPI.readOptions>);
    (InventorySourcesAPI as Untyped).read = vi.fn();
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof InventorySourcesAPI.read>);
    (InventorySourcesAPI as Untyped).readOptions = vi.fn();
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
    (WorkflowJobTemplatesAPI as Untyped).read = async () => ({
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
    (WorkflowJobTemplatesAPI as Untyped).readOptions = async () => ({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    (WorkflowJobTemplatesAPI as Untyped).readLaunch = async () => ({
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
          value={
            {
              nodeToEdit: null,
            } as unknown as WorkflowState
          }
        >
          <NodeModal askLinkType onSave={onSave} title="Add Node" />
        </WorkflowStateContext.Provider>
      </WorkflowDispatchContext.Provider>
    );
    await waitForWizard();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeChecked()
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
    fireEvent.click(document.querySelector('#preview-step')!);
    await waitFor(() => expect(nextButton()).toHaveTextContent('Save'));
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: '',
          linkType: 'always',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
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
    await waitForResource('Test Project');
    clickFirstResource();
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeChecked()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: '',
          linkType: 'failure',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
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
    await waitForResource('Test Inventory Source');
    clickFirstResource();
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeChecked()
    );
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: '',
          linkType: 'failure',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
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
    await waitForResource('Test Workflow Job Template');
    clickFirstResource();
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeChecked()
    );
    clickNext();
    await waitFor(() => expect(nextButton()).not.toBeDisabled());
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: '',
          linkType: 'success',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
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

    // The input existing does not mean the step has settled: the approval form
    // is still mounting, and a change fired now lands on a render that is
    // about to be replaced, so the value is lost. The fields set after this
    // one all stick, which is what gives it away. Flush the pending effects
    // first and the wait the test was relying on becomes explicit.
    await act(async () => {});
    fireEvent.change(document.querySelector('input#approval-name')!, {
      target: { value: 'Test Approval', name: 'approvalName' },
    });
    fireEvent.change(document.querySelector('input#approval-description')!, {
      target: {
        value: 'Test Approval Description',
        name: 'approvalDescription',
      },
    });
    fireEvent.change(
      document.querySelector('input#approval-timeout-minutes')!,
      {
        target: { value: 5, name: 'timeoutMinutes' },
      }
    );
    fireEvent.change(
      document.querySelector('input#approval-timeout-seconds')!,
      {
        target: { value: 30, name: 'timeoutSeconds' },
      }
    );

    expect(document.querySelector('input#approval-name')).toHaveValue(
      'Test Approval'
    );
    expect(document.querySelector('input#approval-description')).toHaveValue(
      'Test Approval Description'
    );
    expect(
      document.querySelector('input#approval-timeout-minutes')
    ).toHaveValue(5);
    expect(
      document.querySelector('input#approval-timeout-seconds')
    ).toHaveValue(30);

    clickNext();
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          approvalDescription: 'Test Approval Description',
          approvalName: 'Test Approval',
          contextTemplate: '',
          identifier: '',
          linkType: 'always',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
          nodeResource: null,
          nodeType: 'workflow_approval_template',
          onTimeout: 'deny',
          requiredApprovals: 1,
          timeoutMinutes: 5,
          timeoutSeconds: 30,
          verbosity: undefined,
        },
        {}
      );
    });
  });

  test('Cancel button dispatches as expected', () => {
    fireEvent.click(document.querySelector('button#cancel-node-modal')!);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CANCEL_NODE_MODAL',
    });
  });
});

describe('Edit existing node', () => {
  beforeEach(() => {
    vi.mocked(useUserProfile).mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: 0,
      isNotificationAdmin: 0,
      isExecEnvAdmin: 0,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('Can successfully change project sync node to workflow approval node', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={
            {
              nodeToEdit: {
                id: 2,
                identifier: 'Foo',
                fullUnifiedJobTemplate: {
                  id: 1,
                  name: 'Test Project',
                  type: 'project',
                },
              },
            } as unknown as WorkflowState
          }
        >
          <NodeModal askLinkType={false} onSave={onSave} title="Edit Node" />
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

    // The input existing does not mean the step has settled: the approval form
    // is still mounting, and a change fired now lands on a render that is
    // about to be replaced, so the value is lost. The fields set after this
    // one all stick, which is what gives it away. Flush the pending effects
    // first and the wait the test was relying on becomes explicit.
    await act(async () => {});
    fireEvent.change(document.querySelector('input#approval-name')!, {
      target: { value: 'Test Approval', name: 'approvalName' },
    });
    fireEvent.change(document.querySelector('input#approval-description')!, {
      target: {
        value: 'Test Approval Description',
        name: 'approvalDescription',
      },
    });
    fireEvent.change(
      document.querySelector('input#approval-timeout-minutes')!,
      {
        target: { value: 5, name: 'timeoutMinutes' },
      }
    );
    fireEvent.change(
      document.querySelector('input#approval-timeout-seconds')!,
      {
        target: { value: 30, name: 'timeoutSeconds' },
      }
    );

    expect(document.querySelector('input#approval-name')).toHaveValue(
      'Test Approval'
    );
    expect(document.querySelector('input#approval-description')).toHaveValue(
      'Test Approval Description'
    );
    expect(
      document.querySelector('input#approval-timeout-minutes')
    ).toHaveValue(5);
    expect(
      document.querySelector('input#approval-timeout-seconds')
    ).toHaveValue(30);

    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: 'Foo',
          approvalDescription: 'Test Approval Description',
          approvalName: 'Test Approval',
          contextTemplate: '',
          linkType: 'success',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
          nodeResource: null,
          nodeType: 'workflow_approval_template',
          onTimeout: 'deny',
          requiredApprovals: 1,
          timeoutMinutes: 5,
          timeoutSeconds: 30,
          verbosity: undefined,
        },
        {}
      );
    });
  });

  test('Can successfully change approval node to workflow job template node', async () => {
    renderWithContexts(
      <WorkflowDispatchContext.Provider value={dispatch}>
        <WorkflowStateContext.Provider
          value={
            {
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
            } as unknown as WorkflowState
          }
        >
          <NodeModal askLinkType={false} onSave={onSave} title="Edit Node" />
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
    await waitForResource('Test Workflow Job Template');
    clickFirstResource();
    await waitFor(() =>
      expect(
        document.querySelector('td#check-action-item-1 input')
      ).toBeChecked()
    );
    clickNext();
    await waitFor(() => expect(nextButton()).not.toBeDisabled());
    clickNext();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        {
          convergence: 'any',
          maxRetries: 0,
          identifier: 'Foo',
          linkType: 'success',
          linkConditionTrigger: 'success',
          linkConditionArtifactKey: '',
          linkConditionOperator: 'eq',
          linkConditionExpectedValue: '',
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
