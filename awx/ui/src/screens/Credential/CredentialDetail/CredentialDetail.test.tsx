import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  CredentialsAPI,
  CredentialTypesAPI,
  CredentialInputSourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  InventorySourcesAPI,
  ExecutionEnvironmentsAPI,
} from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import CredentialDetail from './CredentialDetail';
import { mockCredentials, mockCredentialType } from '../shared';

vi.mock('../../../api');

const mockCredential: Untyped = mockCredentials.results[0];

const mockInputSource = {
  id: 33,
  type: 'credential_input_source',
  url: '/api/v2/credential_input_sources/33/',
  summary_fields: {
    source_credential: {
      id: 424,
      name: 'External Credential',
      description: '',
      kind: 'conjur',
      cloud: false,
      credential_type_id: 20,
    },
  },
  input_field_name: 'ssh_key_unlock',
  metadata: {
    secret_path: '/foo/bar/baz',
    secret_version: '17',
  },
};

describe('<CredentialDetail />', () => {
  beforeEach(() => {
    vi.mocked(CredentialTypesAPI.readDetail).mockResolvedValue({
      data: mockCredentialType,
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(CredentialsAPI.readInputSources).mockResolvedValue({
      data: {
        results: [mockInputSource],
      },
    });
    // related-resource delete-count lookups made by DeleteButton
    const emptyRead = { data: { count: 0, results: [] } };
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
      emptyRead as unknown as ApiResponse<unknown>
    );
    vi.mocked(ProjectsAPI.read).mockResolvedValue(
      emptyRead as unknown as ApiResponse<unknown>
    );
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue(
      emptyRead as unknown as ApiResponse<unknown>
    );
    vi.mocked(CredentialInputSourcesAPI.read).mockResolvedValue(
      emptyRead as unknown as ApiResponse<unknown>
    );
    vi.mocked(ExecutionEnvironmentsAPI.read).mockResolvedValue(
      emptyRead as unknown as ApiResponse<unknown>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderDetail(credential = mockCredential) {
    const result = renderWithContexts(
      <CredentialDetail credential={credential} />
    );
    // wait for the credential type detail fetch to resolve
    await screen.findByText('Name');
    return result;
  }

  test('should render details', async () => {
    await renderDetail();

    assertDetail('Name', mockCredential!.name);
    assertDetail('Description', mockCredential!.description);
    assertDetail(
      'Organization',
      mockCredential!.summary_fields.organization!.name
    );
    assertDetail(
      'Credential Type',
      mockCredential!.summary_fields.credential_type.name
    );
    assertDetail('Username', mockCredential!.inputs.username);
    assertDetail('Password', 'Encrypted');
    assertDetail('SSH Private Key', 'Encrypted');
    assertDetail('Signed SSH Certificate', 'Encrypted');

    // ssh_key_unlock is backed by an external input source: chip + metadata.
    // The chip renders "<kind>: <name>" in the Detail value cell.
    const chipValue = document.querySelector(
      '[data-cy="credential-ssh_key_unlock-detail-value"]'
    );
    expect(chipValue).toHaveTextContent('External Credential');

    // The metadata CodeEditor is mounted; react-ace keeps its value in an
    // internal (jsdom-invisible) model rather than the DOM, so we assert the
    // editor is present rather than reading its text content.
    expect(
      document.querySelector('#credential-ssh_key_unlock-metadata')
    ).toBeInTheDocument();

    assertDetail(
      'Privilege Escalation Method',
      mockCredential!.inputs.become_method
    );
    assertDetail(
      'Privilege Escalation Username',
      mockCredential!.inputs.become_username
    );
    assertDetail('Privilege Escalation Password', 'Prompt on launch');

    const enabledOptions = screen.getByText('Enabled Options');
    expect(enabledOptions.nextElementSibling).toHaveTextContent('Authorize');
  });

  test('should show content error on throw', async () => {
    vi.mocked(CredentialTypesAPI.readDetail).mockRejectedValueOnce(new Error());
    renderWithContexts(<CredentialDetail credential={mockCredential} />);

    expect(
      await screen.findByText(/There was an error loading this content/)
    ).toBeInTheDocument();
  });

  test('handleDelete should call api', async () => {
    (CredentialsAPI as Untyped).destroy = vi.fn().mockResolvedValue({});
    const { user } = await renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() =>
      expect(CredentialsAPI.destroy).toHaveBeenCalledTimes(1)
    );
  });

  test('should show error modal when credential is not successfully deleted from api', async () => {
    (CredentialsAPI as Untyped).destroy = vi
      .fn()
      .mockRejectedValueOnce(new Error());
    const { user } = await renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    // the delete-error AlertModal has no footer actions; close via the X
    await user.click(document.querySelector('button[aria-label="Close"]')!);
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('should not load enabled options', async () => {
    // a credential whose inputs have no enabled boolean fields renders the
    // Enabled Options Detail as isEmpty (nothing in the DOM)
    await renderDetail({
      ...mockCredential,
      inputs: { ...mockCredential!.inputs, authorize: false },
    });

    expect(screen.queryByText('Enabled Options')).not.toBeInTheDocument();
  });
});
