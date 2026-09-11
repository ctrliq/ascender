import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import OrganizationLookup, { _OrganizationLookup } from './OrganizationLookup';

vi.mock('../../api');

describe('OrganizationLookup', () => {
  beforeEach(() => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(OrganizationsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup onChange={() => {}} />
      </Formik>
    );
    expect(await screen.findByText('Organization')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('should fetch organizations', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(OrganizationsAPI.read).toHaveBeenCalledTimes(1));
    expect(OrganizationsAPI.read).toHaveBeenCalledWith({
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
  });

  test('should display "Organization" label', async () => {
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup onChange={() => {}} />
      </Formik>
    );
    expect(await screen.findByText('Organization')).toBeInTheDocument();
  });

  test('should auto-select organization when only one available and autoPopulate prop is true', async () => {
    const org = { id: 1, name: 'org', url: '/api/v2/organizations/1/' };
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        results: [org],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup autoPopulate onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(org));
  });

  test('should not auto-select organization when autoPopulate prop is false', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'org', url: '/api/v2/organizations/1/' }],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(OrganizationsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('should not auto-select organization when multiple available', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'org 1', url: '/api/v2/organizations/1/' },
          { id: 2, name: 'org 2', url: '/api/v2/organizations/2/' },
        ],
        count: 2,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <OrganizationLookup autoPopulate onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(OrganizationsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });
});
