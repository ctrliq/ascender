import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import type { ApiEntity, Paginated } from 'types/api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import LaunchPicker from './LaunchPicker';
import type { NotStarted } from './notStarted';

const things = [
  { id: 1, name: 'first' },
  { id: 2, name: 'second' },
];

function read() {
  return Promise.resolve({
    data: { count: things.length, results: things } as Paginated<ApiEntity>,
  });
}

async function renderPicker(
  onLaunch: (items: ApiEntity[]) => Promise<NotStarted[] | void>,
  onClose = vi.fn()
) {
  const result = renderWithContexts(
    <LaunchPicker
      title="Pick one"
      stepName="Thing"
      read={read}
      onLaunch={onLaunch}
      onClose={onClose}
    />
  );
  await screen.findByText('first');
  return { ...result, onClose };
}

const tickFor = (name: string) =>
  within(screen.getByText(name).closest('tr') as HTMLElement).getByRole(
    'checkbox'
  );

describe('<LaunchPicker />', () => {
  test('should list what it was given to read', async () => {
    await renderPicker(vi.fn());

    // The one step is named for what the list holds, beside the list itself.
    expect(screen.getByRole('button', { name: 'Thing' })).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
    // Nothing is ticked, so there is nothing to launch yet.
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled();
  });

  /* These are the runs somebody starts several of, so the rows tick. */
  test('should launch every row ticked, in the order they were ticked', async () => {
    const onLaunch = vi.fn().mockResolvedValue([]);
    const { user } = await renderPicker(onLaunch);

    await user.click(tickFor('second'));
    await user.click(tickFor('first'));
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() => expect(onLaunch).toHaveBeenCalledTimes(1));
    expect(onLaunch).toHaveBeenCalledWith([things[1], things[0]]);
  });

  /* The list is still the answer to a refusal, so it stays on screen. */
  test('should say why a launch was refused, and stay open', async () => {
    const onLaunch = vi
      .fn()
      .mockRejectedValue({ response: { data: { detail: 'No revision' } } });
    const { user, onClose } = await renderPicker(onLaunch);

    await user.click(tickFor('first'));
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    expect(
      await screen.findByText('Failed to start the run.')
    ).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  /*
   * Some started and some did not: the list looks unchanged either way, so
   * the ones that did not are named.
   */
  test('should name the rows that did not start', async () => {
    const onLaunch = vi.fn().mockResolvedValue([
      {
        name: 'second',
        error: { response: { status: 400, data: { detail: 'No revision' } } },
      },
    ]);
    const { user } = await renderPicker(onLaunch);

    await user.click(tickFor('first'));
    await user.click(tickFor('second'));
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    expect(await screen.findByText('Not started: second')).toBeInTheDocument();
    // With the reason the api gave, rather than the name alone.
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('No revision')).toBeInTheDocument();
  });

  test('should close where the reader asks it to', async () => {
    const { user, onClose } = await renderPicker(vi.fn());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});
