import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowJobsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowRelaunchVariablesModal from './WorkflowRelaunchVariablesModal';

vi.mock('../../api');

const editor = () => document.querySelector('.cm-content') as HTMLElement;

const readDetail = (extraVars: string) =>
  vi.mocked(WorkflowJobsAPI.readDetail).mockResolvedValue({
    data: { extra_vars: extraVars },
  } as unknown as ResponseOf<typeof WorkflowJobsAPI.readDetail>);

describe('WorkflowRelaunchVariablesModal', () => {
  test('opens on the variables of the run, as YAML', async () => {
    readDetail('{"colour": "red", "size": 1}');
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchVariablesModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(editor()).toBeInTheDocument());
    expect(editor().textContent).toBe('colour: redsize: 1');

    await user.click(screen.getByRole('button', { name: 'Relaunch' }));
    expect(onConfirm).toHaveBeenCalledWith({ colour: 'red', size: 1 });
  });

  test('opens on an empty document when the run had no variables', async () => {
    readDetail('');
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchVariablesModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(editor().textContent).toBe('---'));
    await user.click(screen.getByRole('button', { name: 'Relaunch' }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  test('refuses variables that are not a mapping', async () => {
    readDetail('"not a mapping"');
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchVariablesModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(editor()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Relaunch' }));

    expect(
      await screen.findByText('yaml is not in object format')
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('refuses a sequence, which parses but is not a mapping', async () => {
    readDetail('["colour", "size"]');
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchVariablesModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(editor()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Relaunch' }));

    expect(
      await screen.findByText('Variables must be a mapping of names to values.')
    ).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('closes without relaunching when cancelled', async () => {
    readDetail('{"colour": "red"}');
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchVariablesModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await waitFor(() => expect(editor()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
