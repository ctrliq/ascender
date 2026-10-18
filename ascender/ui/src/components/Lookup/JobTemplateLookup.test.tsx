import React from 'react';
import { waitFor } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import JobTemplateLookup from './JobTemplateLookup';

vi.mock('../../api');

const patch = { id: 7, name: 'patch', url: '/api/v2/job_templates/7/' };

describe('<JobTemplateLookup />', () => {
  beforeEach(() => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { results: [patch], count: 1 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('only lists the templates the user can launch', async () => {
    renderWithContexts(
      <FormRoot initialValues={{ job_template: null }} onSubmit={() => {}}>
        <JobTemplateLookup onChange={vi.fn()} />
      </FormRoot>
    );
    await waitFor(() =>
      expect(JobTemplatesAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({ role_level: 'execute_role' })
      )
    );
  });

  test('resolves a typed name among the templates the user can launch', async () => {
    const onChange = vi.fn();
    const { user } = renderWithContexts(
      <FormRoot initialValues={{ job_template: null }} onSubmit={() => {}}>
        <JobTemplateLookup onChange={onChange} />
      </FormRoot>
    );
    const input = document.querySelector(
      'input#job_template'
    ) as HTMLInputElement;
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'patch');
    // the lookup resolves what was typed a second after typing stops
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(patch), {
      timeout: 3000,
    });
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
      name: 'patch',
      role_level: 'execute_role',
    });
  });

  test('clears the value when nothing matches', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { results: [], count: 0 },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    const onChange = vi.fn();
    const { user } = renderWithContexts(
      <FormRoot initialValues={{ job_template: null }} onSubmit={() => {}}>
        <JobTemplateLookup onChange={onChange} />
      </FormRoot>
    );
    const input = document.querySelector(
      'input#job_template'
    ) as HTMLInputElement;
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'nope');
    await waitFor(
      () =>
        expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
          name: 'nope',
          role_level: 'execute_role',
        }),
      { timeout: 3000 }
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('takes its id from the caller', async () => {
    renderWithContexts(
      <FormRoot initialValues={{ job_template: null }} onSubmit={() => {}}>
        <JobTemplateLookup id="test-as" onChange={vi.fn()} />
      </FormRoot>
    );
    await waitFor(() =>
      expect(document.querySelector('input#test-as')).toBeInTheDocument()
    );
    expect(document.querySelector('input#job_template')).toBeNull();
  });
});
