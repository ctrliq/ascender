import React, { useState } from 'react';
import { act, waitFor } from '@testing-library/react';
import { FormRoot } from 'components/Form';
import { JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import JobTemplateLookup from './JobTemplateLookup';

vi.mock('../../api');

const patch = { id: 7, name: 'patch', url: '/api/v2/job_templates/7/' };

// As the forms use it: the selection lives in the caller and comes back as value
function Stateful({
  onChange,
  initial,
}: {
  onChange: (value: unknown) => void;
  initial: typeof patch | null;
}) {
  const [value, setValue] = useState<typeof patch | null>(initial);
  return (
    <FormRoot initialValues={{ job_template: initial }} onSubmit={() => {}}>
      <JobTemplateLookup
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next as typeof patch | null);
        }}
      />
    </FormRoot>
  );
}

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

  test('does not guess between templates of the same name', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { results: [patch, { ...patch, id: 8 }], count: 2 },
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
    await user.type(input, 'patch');
    await waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3000 });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('drops the selection the moment its name is edited, keeping the text', async () => {
    const onChange = vi.fn();
    const { user } = renderWithContexts(
      <Stateful onChange={onChange} initial={patch} />
    );
    const input = document.querySelector(
      'input#job_template'
    ) as HTMLInputElement;
    await waitFor(() => expect(input).toBeEnabled());
    await waitFor(() => expect(input).toHaveValue('patch'));
    await user.type(input, 'x');
    // straight away, without waiting for the name to be looked up
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('patchx');
  });

  test('ignores the answer for a name that has since been edited', async () => {
    let answer: (value: ResponseOf<typeof JobTemplatesAPI.read>) => void = () =>
      undefined;
    const onChange = vi.fn();
    const { user } = renderWithContexts(
      <Stateful onChange={onChange} initial={null} />
    );
    const input = document.querySelector(
      'input#job_template'
    ) as HTMLInputElement;
    await waitFor(() => expect(input).toBeEnabled());
    vi.mocked(JobTemplatesAPI.read).mockImplementation((params) =>
      (params as { name?: string }).name === 'patch'
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.resolve({
            data: { results: [], count: 0 },
          } as unknown as ResponseOf<typeof JobTemplatesAPI.read>)
    );
    await user.type(input, 'patch');
    await waitFor(
      () =>
        expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
          name: 'patch',
          role_level: 'execute_role',
        }),
      { timeout: 3000 }
    );
    await user.type(input, '2');
    await act(async () => {
      answer({
        data: { results: [patch], count: 1 },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    });
    expect(onChange).not.toHaveBeenCalledWith(patch);
    expect(input).toHaveValue('patch2');
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
