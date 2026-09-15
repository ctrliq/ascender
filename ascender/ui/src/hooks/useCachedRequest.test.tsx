import React, { useCallback } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithContexts } from '../../testUtils/rtlContexts';
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
