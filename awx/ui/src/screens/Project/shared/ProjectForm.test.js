import React from 'react';
import { act } from 'react-dom/test-utils';
import { CredentialTypesAPI, ProjectsAPI, RootAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
import ProjectForm from './ProjectForm';

jest.mock('../../../api');

describe('<ProjectForm />', () => {
  let wrapper;
  const mockData = {
    name: 'foo',
    description: 'bar',
    scm_type: 'git',
    scm_url: 'https://foo.bar',
    scm_clean: true,
    scm_track_submodules: false,
    credential: 100,
    signature_validation_credential: 200,
    organization: 2,
    scm_update_on_launch: true,
    scm_update_cache_timeout: 3,
    allow_override: false,
    custom_virtualenv: '/var/lib/awx/venv/custom-env',
    summary_fields: {
      credential: {
        id: 100,
        credential_type_id: 4,
        kind: 'scm',
        name: 'Foo',
      },
      organization: {
        id: 2,
        name: 'Default',
      },
      signature_validation_credential: {
        id: 200,
        credential_type_id: 6,
        kind: 'cryptography',
        name: 'Svc',
      },
    },
  };

  const projectOptionsResolve = {
    data: {
      actions: {
        GET: {
          scm_type: {
            choices: [
              ['', 'Manual'],
              ['git', 'Git'],
              ['svn', 'Subversion'],
              ['archive', 'Remote Archive'],
            ],
          },
        },
      },
    },
  };

  const scmCredentialResolve = {
    data: {
      count: 1,
      results: [
        {
          id: 4,
          name: 'Source Control',
          kind: 'scm',
        },
      ],
    },
  };

  const cryptographyCredentialResolve = {
    data: {
      count: 1,
      results: [
        {
          id: 6,
          name: 'GPG Public Key',
          kind: 'cryptography',
        },
      ],
    },
  };

  beforeEach(async () => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    await ProjectsAPI.readOptions.mockImplementation(
      () => projectOptionsResolve
    );
    await CredentialTypesAPI.read.mockImplementation(
      () => scmCredentialResolve
    );
    await CredentialTypesAPI.read.mockImplementation(
      () => cryptographyCredentialResolve
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
      );
    });

    expect(wrapper.find('ProjectForm').length).toBe(1);
  });

  test('new form displays primary form fields', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('FormGroup[label="Name"]').length).toBe(1);
    expect(wrapper.find('FormGroup[label="Description"]').length).toBe(1);
    expect(wrapper.find('FormGroup[label="Organization"]').length).toBe(1);
    expect(wrapper.find('FormGroup[label="Source Control Type"]').length).toBe(
      1
    );
    expect(wrapper.find('FormGroup[label="Ansible Environment"]').length).toBe(
      0
    );
    expect(wrapper.find('FormGroup[label="Options"]').length).toBe(0);
  });

  test('should display scm subform when scm type select has a value', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    await act(async () => {
      await wrapper.find('AnsibleSelect[id="scm_type"]').invoke('onChange')(
        null,
        'git'
      );
    });
    wrapper.update();
    expect(wrapper.find('FormGroup[label="Source Control URL"]').length).toBe(
      1
    );
    expect(
      wrapper.find('FormGroup[label="Source Control Branch/Tag/Commit"]').length
    ).toBe(1);
    expect(
      wrapper.find('FormGroup[label="Source Control Refspec"]').length
    ).toBe(1);
    expect(
      wrapper.find('FormGroup[label="Content Signature Validation Credential"]')
        .length
    ).toBe(1);
    expect(
      wrapper.find('FormGroup[label="Source Control Credential"]').length
    ).toBe(1);
    expect(
      wrapper.find('FormGroup[label="Content Signature Validation Credential"]')
        .length
    ).toBe(1);
    expect(wrapper.find('FormGroup[label="Options"]').length).toBe(1);
  });

  test('inputs should update form value on change', async () => {
    const project = { ...mockData };
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          project={project}
        />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    await act(async () => {
      wrapper.find('OrganizationLookup').invoke('onBlur')();
      wrapper.find('OrganizationLookup').invoke('onChange')({
        id: 1,
        name: 'organization',
      });
      wrapper
        .find('CredentialLookup[label="Source Control Credential"]')
        .invoke('onBlur')();
      wrapper
        .find('CredentialLookup[label="Source Control Credential"]')
        .invoke('onChange')({
        id: 10,
        name: 'credential',
      });
      wrapper
        .find(
          'CredentialLookup[label="Content Signature Validation Credential"]'
        )
        .invoke('onBlur')();
      wrapper
        .find(
          'CredentialLookup[label="Content Signature Validation Credential"]'
        )
        .invoke('onChange')({
        id: 20,
        name: 'signature_validation_credential',
      });
    });
    wrapper.update();
    expect(wrapper.find('OrganizationLookup').prop('value')).toEqual({
      id: 1,
      name: 'organization',
    });
    expect(
      wrapper
        .find('CredentialLookup[label="Source Control Credential"]')
        .prop('value')
    ).toEqual({
      id: 10,
      name: 'credential',
    });
    expect(
      wrapper
        .find(
          'CredentialLookup[label="Content Signature Validation Credential"]'
        )
        .prop('value')
    ).toEqual({
      id: 20,
      name: 'signature_validation_credential',
    });
  });

  test('manual subform should display expected fields', async () => {
    const config = {
      project_local_paths: ['foobar', 'qux'],
      project_base_dir: 'dir/foo/bar',
    };
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          project={{ scm_type: '', local_path: '/_foo__bar' }}
        />,
        {
          context: { config },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    const playbookDirectorySelect = wrapper.find(
      'FormGroup[label="Playbook Directory"] FormSelect'
    );
    await act(async () => {
      playbookDirectorySelect
        .props()
        .onChange('foobar', { target: { name: 'foobar' } });
    });
    expect(wrapper.find('FormGroup[label="Project Base Path"]').length).toBe(1);
    expect(wrapper.find('FormGroup[label="Playbook Directory"]').length).toBe(
      1
    );
  });

  test('manual subform should display warning message when playbook directory is empty', async () => {
    const config = {
      project_local_paths: [],
      project_base_dir: 'dir/foo/bar',
    };
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm
          handleSubmit={jest.fn()}
          handleCancel={jest.fn()}
          project={{ scm_type: '', local_path: '' }}
        />,
        {
          context: { config },
        }
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('ManualSubForm Alert').length).toBe(1);
  });

  test('should call handleSubmit when Submit button is clicked', async () => {
    const handleSubmit = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm
          project={mockData}
          handleSubmit={handleSubmit}
          handleCancel={jest.fn()}
        />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(handleSubmit).not.toHaveBeenCalled();
    await act(async () => {
      wrapper.find('button[aria-label="Save"]').simulate('click');
    });
    expect(handleSubmit).toBeCalled();
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm
          project={mockData}
          handleSubmit={jest.fn()}
          handleCancel={handleCancel}
        />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(handleCancel).not.toHaveBeenCalled();
    wrapper.find('button[aria-label="Cancel"]').invoke('onClick')();
    expect(handleCancel).toBeCalled();
  });

  test('should display ContentError on throw', async () => {
    CredentialTypesAPI.read.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await act(async () => {
      wrapper = mountWithContexts(
        <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
    expect(wrapper.find('ContentError').length).toBe(1);
  });
});
