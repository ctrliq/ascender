import React, { useCallback } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

import { renderWithContexts } from '../../testUtils/rtlContexts';
import { makeQueryClient } from '../queryClient';
import useCachedRequest from './useCachedRequest';

const read = vi.fn();

function Rows({ search = '' }: { search?: string }) {
  const { result, isLoading, error, request, setValue } = useCachedRequest(
    ['rows', search],
    useCallback(async () => {
      const names = (await read(search)) as string[];
      return { names };
    }, [search]),
    { names: [] as string[] }
  );

  if (isLoading) {
    return <div>loading</div>;
  }
  if (error) {
    return <div>failed</div>;
  }
  return (
    <div>
      <ul data-testid={`rows-${search}`}>
        {result.names.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <button type="button" onClick={() => request()}>
        refresh
      </button>
      <button
        type="button"
        onClick={() => setValue({ names: ['set directly'] })}
      >
        set
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  read.mockResolvedValue(['one']);
});

describe('useCachedRequest', () => {
  it('returns what the request resolved to', async () => {
    renderWithContexts(<Rows />);

    expect(await screen.findByText('one')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('two components asking for the same thing cost one request', async () => {
    renderWithContexts(
      <>
        <Rows />
        <Rows />
      </>
    );

    await waitFor(() => expect(screen.getAllByText('one')).toHaveLength(2));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a different key is a different read', async () => {
    renderWithContexts(
      <>
        <Rows search="?page=1" />
        <Rows search="?page=2" />
      </>
    );

    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenCalledWith('?page=1');
    expect(read).toHaveBeenCalledWith('?page=2');
  });

  it('request() reads again, which is what a delete relies on', async () => {
    // The screens that moved call request() after deleting a row. If that
    // stopped meaning "read it again now" the list would keep showing what was
    // just removed, which no existing test would catch.
    const user = userEvent.setup();
    renderWithContexts(<Rows />);
    expect(await screen.findByText('one')).toBeInTheDocument();
    read.mockResolvedValue(['two']);

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    expect(await screen.findByText('two')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a list mounted again paints the cached rows, then reads the API', async () => {
    // The app's own client, whose staleTime would otherwise answer a list
    // reopened within thirty seconds from the cache alone. A host deleted from
    // its detail page would then still be on the list it navigates back to.
    const user = userEvent.setup();
    function Toggle() {
      const [shown, setShown] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setShown(!shown)}>
            toggle
          </button>
          {shown && <Rows />}
        </>
      );
    }
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <Toggle />
      </QueryClientProvider>
    );
    expect(await screen.findByText('one')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'toggle' }));
    // Held open, so what is on screen while the read is out can be seen.
    let answer: (names: string[]) => void = () => {};
    read.mockReturnValue(
      new Promise<string[]>((resolve) => {
        answer = resolve;
      })
    );
    await user.click(screen.getByRole('button', { name: 'toggle' }));

    // The cached row first, rather than a loading state...
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
    // ...and what the API says now once it answers.
    answer(['two']);
    expect(await screen.findByText('two')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('request() reads every page and filter of the same list again', async () => {
    // A delete on one page changes the others too, and any search that
    // matched the row, so a refresh is for the list and not only one variant.
    const user = userEvent.setup();
    renderWithContexts(
      <>
        <Rows search="?page=1" />
        <Rows search="?page=2" />
      </>
    );
    const [refresh] = await screen.findAllByRole('button', { name: 'refresh' });
    expect(read).toHaveBeenCalledTimes(2);

    await user.click(refresh!);

    await waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    expect(
      read.mock.calls
        .slice(2)
        .map(([search]) => search)
        .sort()
    ).toEqual(['?page=1', '?page=2']);
  });

  it('setValue changes the rows without going back to the API', async () => {
    const user = userEvent.setup();
    renderWithContexts(<Rows />);
    expect(await screen.findByText('one')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'set' }));

    expect(await screen.findByText('set directly')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a failure is reported rather than swallowed', async () => {
    read.mockRejectedValue(new Error('no'));

    renderWithContexts(<Rows />);

    expect(await screen.findByText('failed')).toBeInTheDocument();
  });
});
