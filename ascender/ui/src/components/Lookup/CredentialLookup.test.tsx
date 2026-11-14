import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { FormRoot } from 'components/Form';
import { CredentialsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CredentialLookup from './CredentialLookup';

vi.mock('../../api');

describe('CredentialLookup', () => {
  beforeEach(() => {
    vi.mocked(CredentialsAPI.read).mockResolvedValueOnce({
      data: {
        results: [
          { id: 1, kind: 'cloud', name: 'Cred 1', url: 'www.google.com' },
          { id: 2, kind: 'ssh', name: 'Cred 2', url: 'www.google.com' },
          { id: 3, kind: 'Ansible', name: 'Cred 3', url: 'www.google.com' },
          { id: 4, kind: 'Machine', name: 'Cred 4', url: 'www.google.com' },
          { id: 5, kind: 'Machine', name: 'Cred 5', url: 'www.google.com' },
        ],
        count: 5,
      },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    vi.mocked(CredentialsAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            name: { type: 'string', filterable: true },
            type: { type: 'choice', filterable: true },
          },
        },
        related_search_fields: ['credential_type__search'],
      },
    } as unknown as ResponseOf<typeof CredentialsAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </FormRoot>
    );
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('should fetch credentials', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </FormRoot>
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));
    expect(CredentialsAPI.read).toHaveBeenCalledWith({
      credential_type: 1,
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
  });

  /*
   * The project form holds two of these, the source control credential and
   * the signature validation one. Each keeps its own paging and search under
   * its field's name, so a search in one neither reaches the other's request
   * nor sends it again, and each open button has an id of its own.
   */
  test('should keep two lookups on one form apart', async () => {
    vi.mocked(CredentialsAPI.read).mockReset();
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    const history = createMemoryHistory({ initialEntries: ['/projects/add'] });
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={2}
          label="Source Control Credential"
          onChange={() => {}}
        />
        <CredentialLookup
          credentialTypeId={9}
          label="Signature Validation Credential"
          fieldName="signature_validation_credential"
          onChange={() => {}}
        />
      </FormRoot>,
      { context: { router: { history } } }
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(2));
    expect(document.getElementById('credential-open')).toBeInTheDocument();
    expect(
      document.getElementById('signature_validation_credential-open')
    ).toBeInTheDocument();

    act(() => history.push('/projects/add?credential.name__icontains=git'));

    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(3));
    expect(CredentialsAPI.read).toHaveBeenLastCalledWith(
      expect.objectContaining({
        credential_type: 2,
        name__icontains: 'git',
      })
    );
    // Give a stray request from the other lookup the chance to show itself.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    expect(CredentialsAPI.read).toHaveBeenCalledTimes(3);
  });

  test('should display label', async () => {
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </FormRoot>
    );
    expect(await screen.findByText('Foo')).toBeInTheDocument();
  });

  test('should not auto-select credential when autoPopulate prop is false', async () => {
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'Cred 1', url: 'www.google.com' }],
        count: 1,
      },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    const onChange = vi.fn();
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={onChange}
        />
      </FormRoot>
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('should not auto-select credential when multiple available', async () => {
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Cred 1', url: 'www.google.com' },
          { id: 2, name: 'Cred 2', url: 'www.google.com' },
        ],
        count: 2,
      },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    const onChange = vi.fn();
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          autoPopulate
          onChange={onChange}
        />
      </FormRoot>
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CredentialLookup auto select', () => {
  test('should auto-select credential when only one available and autoPopulate prop is true', async () => {
    const cred = { id: 1, name: 'Cred 1', url: 'www.google.com' };
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: {
        results: [cred],
        count: 1,
      },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    vi.mocked(CredentialsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof CredentialsAPI.readOptions>);
    const onChange = vi.fn();
    renderWithContexts(
      <FormRoot initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          autoPopulate
          credentialTypeId={1}
          label="Foo"
          onChange={onChange}
        />
      </FormRoot>
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(cred));
  });
});
