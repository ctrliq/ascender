import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ProjectLookup from './ProjectLookup';

vi.mock('../../api');

describe('<ProjectLookup />', () => {
  beforeEach(() => {
    vi.mocked(ProjectsAPI.readOptions).mockResolvedValue({
      data: {
        actions: { GET: {} },
        related_search_fields: [],
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should auto-select project when only one available and autoPopulate prop is true', async () => {
    const project = { id: 1, name: 'Test', url: '/api/v2/projects/1/' };
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: {
        results: [project],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup autoPopulate onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(project));
  });

  test('should not auto-select project when autoPopulate prop is false', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'Test', url: '/api/v2/projects/1/' }],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('should not auto-select project when multiple available', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Test', url: '/api/v2/projects/1/' },
          { id: 2, name: 'Test 2', url: '/api/v2/projects/2/' },
        ],
        count: 2,
      },
    } as unknown as ApiResponse<Untyped>);
    const onChange = vi.fn();
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup autoPopulate onChange={onChange} />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('project lookup should be enabled', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: {
        results: [{ id: 1, name: 'Test', url: '/api/v2/projects/1/' }],
        count: 1,
      },
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup isOverrideDisabled onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
    );
  });

  test('project lookup should be disabled', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup onChange={() => {}} />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    );
  });

  test('should not show helper text when valid', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup
          isValid
          helperTextInvalid="select value"
          onChange={() => {}}
        />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('select value')).not.toBeInTheDocument();
  });

  test('should show helper text when invalid', async () => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(
      <Formik initialValues={{}} onSubmit={() => {}}>
        <ProjectLookup
          isValid={false}
          helperTextInvalid="select value"
          onChange={() => {}}
        />
      </Formik>
    );
    await waitFor(() => expect(ProjectsAPI.read).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('select value')).toBeInTheDocument();
  });
});
