import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ToolbarSyncButton, { SYNC_BATCH_SIZE } from './ToolbarSyncButton';

const projects = [
  { id: 1, name: 'from git', scm_type: 'git', start: true },
  { id: 2, name: 'typed in', scm_type: '', start: true },
  { id: 3, name: 'not mine', scm_type: 'git', start: false },
];

type Project = (typeof projects)[number];
const hasSource = (item: Project) => Boolean(item.scm_type);
const canSync = (item: Project) => hasSource(item) && item.start;

function renderButton({
  itemsToSync = [] as Project[],
  syncableCount = 1,
  sourcedCount = undefined as number | undefined,
  sync = vi.fn().mockResolvedValue({}),
  readSyncable = vi.fn().mockResolvedValue([projects[0]]),
  isChecking = false,
} = {}) {
  const result = renderWithContexts(
    <ToolbarSyncButton
      itemsToSync={itemsToSync}
      canSync={canSync}
      hasSource={hasSource}
      syncableCount={syncableCount}
      sourcedCount={sourcedCount}
      readSyncable={readSyncable}
      sync={sync}
      pluralizedItemName="Projects"
      isChecking={isChecking}
    />
  );
  return { ...result, sync, readSyncable };
}

describe('<ToolbarSyncButton />', () => {
  /*
   * With rows ticked the button waits while the list still finds out which
   * of them may be synced, and says so; with nothing ticked there is nothing
   * to wait for.
   */
  test('waits while the list checks the ticked rows', async () => {
    const { user } = renderButton({
      itemsToSync: projects.slice(0, 1),
      isChecking: true,
    });

    const button = screen.getByRole('button', { name: 'Sync' });
    expect(button).toBeDisabled();
    await user.hover(button);
    expect(
      await screen.findByText('Checking which of the selected may be synced')
    ).toBeInTheDocument();
  });

  test('does not wait on a check with nothing ticked', () => {
    renderButton({ isChecking: true });

    expect(screen.getByRole('button', { name: 'Sync All' })).toBeEnabled();
  });

  /*
   * A new installation has nothing to sync, and neither has a list whose
   * every project was typed in rather than pulled from anywhere.
   */
  test('should be off where nothing in the list has a source', async () => {
    renderButton({ syncableCount: 0 });

    expect(screen.getByRole('button', { name: 'Sync All' })).toBeDisabled();
  });

  test('says there is nothing to sync from where nothing has a source', async () => {
    const { user } = renderButton({ syncableCount: 0 });

    await user.hover(screen.getByRole('button', { name: 'Sync All' }));
    expect(
      await screen.findByText('Nothing here has a source to sync from.')
    ).toBeInTheDocument();
  });

  /*
   * Sources there are, but none the reader may start: the button is off
   * all the same, and says so rather than blaming the sources.
   */
  test('says permission is missing where nothing may be synced', async () => {
    const { user } = renderButton({ syncableCount: 0, sourcedCount: 4 });

    const button = screen.getByRole('button', { name: 'Sync All' });
    expect(button).toBeDisabled();
    await user.hover(button);
    expect(
      await screen.findByText(
        'You do not have permission to sync any of these.'
      )
    ).toBeInTheDocument();
  });

  test('should sync what is ticked', async () => {
    const { user, sync, readSyncable } = renderButton({
      itemsToSync: projects,
    });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    // The one with a source the reader may start, and neither of the others.
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(sync).toHaveBeenCalledWith(projects[0]);
    expect(readSyncable).not.toHaveBeenCalled();
  });

  /*
   * Every sync that was started went through, and the reader is still told
   * about the rows left out, each reason counted on its own.
   */
  test('should say what was left out even when every sync started', async () => {
    const { user } = renderButton({ itemsToSync: projects });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    expect(await screen.findByText('Syncs started: 1')).toBeInTheDocument();
    expect(
      screen.getByText('1 of those selected have no source to sync from.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You do not have permission to sync 1 of those selected.'
      )
    ).toBeInTheDocument();
  });

  test('should say nothing where every ticked row started', async () => {
    const { user, sync } = renderButton({
      itemsToSync: projects.slice(0, 1),
    });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /*
   * Nothing ticked is the whole list, and the click is the whole answer: the
   * rows come from the api, so what is synced is not only the page in front
   * of the reader.
   */
  test('should sync everything where nothing is ticked', async () => {
    const { user, sync, readSyncable } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Sync All' }));

    await waitFor(() => expect(readSyncable).toHaveBeenCalled());
    await waitFor(() => expect(sync).toHaveBeenCalledWith(projects[0]));
  });

  test('should leave out what has no source where nothing is ticked', async () => {
    const readSyncable = vi.fn().mockResolvedValue(projects.slice(0, 2));
    const { user, sync } = renderButton({ readSyncable });

    await user.click(screen.getByRole('button', { name: 'Sync All' }));

    await waitFor(() => expect(sync).toHaveBeenCalledWith(projects[0]));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test('says Sync Selected in its tooltip once a row is ticked', async () => {
    const { user } = renderButton({ itemsToSync: projects.slice(0, 1) });

    await user.hover(screen.getByRole('button', { name: 'Sync' }));
    expect(await screen.findByText('Sync Selected')).toBeInTheDocument();
  });

  test('says Sync All with nothing ticked, and Sync once a row is', () => {
    const { unmount } = renderButton();
    expect(screen.getByRole('button', { name: 'Sync All' })).toHaveTextContent(
      'Sync All'
    );
    unmount();

    renderButton({ itemsToSync: projects.slice(0, 1) });
    expect(screen.getByRole('button', { name: 'Sync' })).toHaveTextContent(
      /^Sync$/
    );
  });

  test('names the list in its tooltip where nothing is ticked', async () => {
    const { user } = renderButton();

    await user.hover(screen.getByRole('button', { name: 'Sync All' }));
    expect(await screen.findByText('Sync all Projects')).toBeInTheDocument();
  });

  test('should name what the api refused', async () => {
    const sync = vi.fn().mockRejectedValue(new Error('no revision'));
    const { user } = renderButton({
      itemsToSync: projects.slice(0, 1),
      sync,
    });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    expect(
      await screen.findByText('Not started: from git')
    ).toBeInTheDocument();
  });

  /*
   * Sync All on a long list is hundreds of launches. They go a few at a time,
   * the next one starting as each answers, and a refusal among them is still
   * named once they are all in.
   */
  test('should start a long list a few at a time', async () => {
    const many = Array.from({ length: 12 }, (_unused, index) => ({
      id: index + 1,
      name: `project ${index + 1}`,
      scm_type: 'git',
      start: true,
    }));
    const answer: (() => void)[] = [];
    let inFlight = 0;
    let mostInFlight = 0;
    const sync = vi.fn(
      (item: Project) =>
        new Promise((resolve, reject) => {
          inFlight += 1;
          mostInFlight = Math.max(mostInFlight, inFlight);
          answer.push(() => {
            inFlight -= 1;
            if (item.id === 7) {
              reject(new Error('no revision'));
            } else {
              resolve({});
            }
          });
        })
    );
    const readSyncable = vi.fn().mockResolvedValue(many);
    const { user } = renderButton({ sync, readSyncable, syncableCount: 12 });

    await user.click(screen.getByRole('button', { name: 'Sync All' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(SYNC_BATCH_SIZE));

    // Answer them one by one, each freeing a slot for the next.
    while (answer.length) {
      // One at a time on purpose: each answer is what starts the next sync.
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        answer.shift()?.();
      });
    }

    expect(
      await screen.findByText('Not started: project 7')
    ).toBeInTheDocument();
    expect(sync).toHaveBeenCalledTimes(12);
    expect(mostInFlight).toBe(SYNC_BATCH_SIZE);
    expect(screen.getByText('Syncs started: 11')).toBeInTheDocument();
  });

  test('should say so where nothing ticked has a source', async () => {
    const { user, sync } = renderButton({
      itemsToSync: projects.slice(1, 2),
    });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    expect(
      await screen.findByText('None of those selected can be synced.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 of those selected have no source to sync from.')
    ).toBeInTheDocument();
    expect(sync).not.toHaveBeenCalled();
  });
});
