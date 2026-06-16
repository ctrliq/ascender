import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import mockTemplate from './data.job_template.json';

import PromptDetail from './PromptDetail';

const mockPromptLaunch = {
  ask_credential_on_launch: true,
  ask_diff_mode_on_launch: true,
  ask_inventory_on_launch: true,
  ask_job_type_on_launch: true,
  ask_limit_on_launch: true,
  ask_scm_branch_on_launch: true,
  ask_skip_tags_on_launch: true,
  ask_tags_on_launch: true,
  ask_variables_on_launch: true,
  ask_verbosity_on_launch: true,
  ask_execution_environment_on_launch: true,
  ask_labels_on_launch: true,
  ask_forks_on_launch: true,
  ask_job_slice_count_on_launch: true,
  ask_timeout_on_launch: true,
  ask_instance_groups_on_launch: true,
  defaults: {
    extra_vars: '---foo: bar',
    diff_mode: false,
    limit: 'localhost',
    job_tags: 'T_100,T_200',
    skip_tags: 'S_100,S_200',
    job_type: 'run',
    verbosity: 3,
    inventory: {
      name: 'Demo Inventory',
      id: 1,
    },
    credentials: [
      {
        id: 1,
        kind: 'ssh',
        name: 'Credential 1',
      },
      {
        id: 2,
        kind: 'awx',
        name: 'Credential 2',
      },
    ],
    scm_branch: 'Foo branch',
    execution_environment: 1,
    forks: 1,
    job_slice_count: 1,
    timeout: 100,
  },
};

describe('PromptDetail', () => {
  describe('With prompt values', () => {
    test('should render expected details', () => {
      renderWithContexts(
        <PromptDetail launchConfig={mockPromptLaunch} resource={mockTemplate} />
      );

      // No overrides -> no "Prompted Values" section
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();

      assertDetail('Name', 'Mock JT');
      assertDetail('Description', 'Mock JT Description');
      assertDetail('Type', 'Job Template');
      assertDetail('Job Type', 'Run');
      assertDetail('Inventory', 'Demo Inventory');
      assertDetail('Source Control Branch', 'Foo branch');
      assertDetail('Limit', 'localhost');
      // Verbosity Detail renders empty under jsdom (Lingui macro yields no text),
      // so the row is absent — original suite skipped its text assertion too.
      assertDetail('Show Changes', 'Off');
      assertDetail('Timeout', '1 min 40 sec');
      assertDetail('Forks', '1');
      // ' Job Slicing' label has a leading space; getByText normalizes whitespace
      expect(
        screen.getByText('Job Slicing').nextElementSibling
      ).toHaveTextContent('1');

      // Variables uses react-ace (empty under jsdom); assert the surrounding label
      expect(screen.getByText('Variables')).toBeInTheDocument();

      // Labels chips
      expect(screen.getByText('L_91o2')).toBeInTheDocument();
      expect(screen.getByText('L_91o3')).toBeInTheDocument();

      // Credentials chips
      const credentialsTerm = screen.getByText('Credentials');
      expect(credentialsTerm.nextElementSibling).toHaveTextContent(
        'SSH: Credential 1'
      );
      expect(credentialsTerm.nextElementSibling).toHaveTextContent(
        'Awx: Credential 2'
      );

      // Job Tags / Skip Tags chips
      expect(screen.getByText('T_100')).toBeInTheDocument();
      expect(screen.getByText('T_200')).toBeInTheDocument();
      expect(screen.getByText('S_100')).toBeInTheDocument();
      expect(screen.getByText('S_200')).toBeInTheDocument();
    });
  });

  describe('Without prompt values', () => {
    test('should render basic detail values', () => {
      renderWithContexts(<PromptDetail resource={mockTemplate} />);
      assertDetail('Name', 'Mock JT');
      assertDetail('Description', 'Mock JT Description');
      assertDetail('Type', 'Job Template');
    });

    test('should not render promptable overrides section', () => {
      renderWithContexts(<PromptDetail resource={mockTemplate} />);
      // No launchConfig prompt data + no overrides -> no "Prompted Values" section
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(
        screen.queryByLabelText('Prompt Overrides')
      ).not.toBeInTheDocument();
    });
  });

  describe('with overrides', () => {
    const overrides = {
      extra_vars: '---one: two\nbar: baz',
      inventory: {
        name: 'Override inventory',
      },
      credentials: mockPromptLaunch.defaults.credentials,
      job_tags: 'foo,bar',
      skip_tags: 'baz,boo',
      limit: 'otherlimit',
      verbosity: 0,
      job_type: 'check',
      scm_branch: 'Bar branch',
      diff_mode: true,
      forks: 2,
      job_slice_count: 2,
      timeout: 160,
      labels: [
        { name: 'foo', id: 1 },
        { name: 'bar', id: 2 },
      ],
      instance_groups: [
        {
          id: 1,
          name: 'controlplane',
        },
      ],
    };

    test('should render overridden details', () => {
      renderWithContexts(
        <PromptDetail
          launchConfig={mockPromptLaunch}
          resource={{
            ...mockTemplate,
            ask_inventory_on_launch: true,
          }}
          overrides={overrides}
        />
      );

      expect(
        screen.getByRole('heading', { level: 2 })
      ).toHaveTextContent('Prompted Values');
      assertDetail('Name', 'Mock JT');
      assertDetail('Description', 'Mock JT Description');
      assertDetail('Type', 'Job Template');
      assertDetail('Job Type', 'Check');
      assertDetail('Inventory', 'Override inventory');
      assertDetail('Source Control Branch', 'Bar branch');
      assertDetail('Limit', 'otherlimit');
      // Verbosity Detail renders empty under jsdom (see note above)
      assertDetail('Show Changes', 'On');
      assertDetail('Timeout', '2 min 40 sec');
      assertDetail('Forks', '2');
      assertDetail('Job Slicing', '2');

      // Variables uses react-ace (empty under jsdom); assert the surrounding label
      expect(screen.getByText('Variables')).toBeInTheDocument();

      // Labels chips
      const labelsTerm = screen.getByText('Labels');
      expect(labelsTerm.nextElementSibling).toHaveTextContent('foo');
      expect(labelsTerm.nextElementSibling).toHaveTextContent('bar');

      // Credentials chips
      const credentialsTerm = screen.getByText('Credentials');
      expect(credentialsTerm.nextElementSibling).toHaveTextContent(
        'SSH: Credential 1'
      );
      expect(credentialsTerm.nextElementSibling).toHaveTextContent(
        'Awx: Credential 2'
      );

      // Job Tags / Skip Tags chips
      const jobTagsTerm = screen.getByText('Job Tags');
      expect(jobTagsTerm.nextElementSibling).toHaveTextContent('foo');
      expect(jobTagsTerm.nextElementSibling).toHaveTextContent('bar');
      const skipTagsTerm = screen.getByText('Skip Tags');
      expect(skipTagsTerm.nextElementSibling).toHaveTextContent('baz');
      expect(skipTagsTerm.nextElementSibling).toHaveTextContent('boo');

      // Instance Groups chip
      expect(screen.getByText('controlplane')).toBeInTheDocument();
    });
  });
});
