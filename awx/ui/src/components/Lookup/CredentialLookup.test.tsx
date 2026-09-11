import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { CredentialsAPI } from 'api';
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
    } as unknown as ApiResponse<Untyped>);
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
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </Formik>
    );
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('should fetch credentials', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </Formik>
    );
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));
    expect(CredentialsAPI.read).toHaveBeenCalledWith({
      credential_type: 1,
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
  });

  test('should display label', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={() => {}}
        />
      </Formik>
    );
    expect(await screen.findByText('Foo')).toBeInTheDocument();
  });

  test('should not auto-select credential when autoPopulate prop is false', async () => {
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'Cred 1', url: 'www.google.com' }],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          onChange={onChange}
        />
      </Formik>
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
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          credentialTypeId={1}
          label="Foo"
          autoPopulate
          onChange={onChange}
        />
      </Formik>
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
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(CredentialsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <CredentialLookup
          autoPopulate
          credentialTypeId={1}
          label="Foo"
          onChange={onChange}
        />
      </Formik>
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(cred));
  });
});
