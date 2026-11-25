import React from 'react';
import { act, render } from '@testing-library/react';
import type { WebsocketMessage } from 'hooks/useWebsocket';
import useStatusSummaryRefetch, {
  type StatusCounts,
} from './useStatusSummaryRefetch';

interface TestProps {
  lastMessage: WebsocketMessage | null;
  refetch: () => Promise<StatusCounts>;
  onCounts: (counts: StatusCounts) => void;
  enabled?: boolean;
  pageKey?: string;
  throttleMs?: number;
}

function Test({
  lastMessage,
  refetch,
  onCounts,
  enabled = true,
  pageKey = '',
  throttleMs = 5000,
}: TestProps) {
  useStatusSummaryRefetch({
    lastMessage,
    refetch,
    onCounts,
    enabled,
    pageKey,
    throttleMs,
  });
  return <div />;
}

describe('useStatusSummaryRefetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('refreshes counts for a job status message', async () => {
    const refetch = vi.fn().mockResolvedValue({ running: 2, pending: 1 });
    const onCounts = vi.fn();
    const { rerender } = render(
      <Test lastMessage={null} refetch={refetch} onCounts={onCounts} />
    );

    await act(async () => {
      rerender(
        <Test
          lastMessage={{ unified_job_id: 1, status: 'successful' }}
          refetch={refetch}
          onCounts={onCounts}
        />
      );
      await Promise.resolve();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(onCounts).toHaveBeenCalledWith({ running: 2, pending: 1 });
  });

  test('ignores messages that cannot change a count', async () => {
    const refetch = vi.fn().mockResolvedValue({ running: 2 });
    const onCounts = vi.fn();
    const { rerender } = render(
      <Test lastMessage={null} refetch={refetch} onCounts={onCounts} />
    );

    await act(async () => {
      rerender(
        <Test
          lastMessage={{ group_name: 'schedules' }}
          refetch={refetch}
          onCounts={onCounts}
        />
      );
      await Promise.resolve();
    });

    expect(refetch).not.toHaveBeenCalled();
  });

  test('coalesces a burst into one leading and one trailing read', async () => {
    const refetch = vi.fn().mockResolvedValue({ running: 1 });
    const onCounts = vi.fn();
    const { rerender } = render(
      <Test lastMessage={null} refetch={refetch} onCounts={onCounts} />
    );

    await act(async () => {
      rerender(
        <Test
          lastMessage={{ unified_job_id: 1, status: 'running' }}
          refetch={refetch}
          onCounts={onCounts}
        />
      );
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <Test
          lastMessage={{ unified_job_id: 2, status: 'running' }}
          refetch={refetch}
          onCounts={onCounts}
        />
      );
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  test('does not read while disabled', async () => {
    const refetch = vi.fn().mockResolvedValue({ running: 1 });
    const onCounts = vi.fn();
    const { rerender } = render(
      <Test
        lastMessage={null}
        refetch={refetch}
        onCounts={onCounts}
        enabled={false}
      />
    );

    await act(async () => {
      rerender(
        <Test
          lastMessage={{ unified_job_id: 1, status: 'running' }}
          refetch={refetch}
          onCounts={onCounts}
          enabled={false}
        />
      );
      await Promise.resolve();
    });

    expect(refetch).not.toHaveBeenCalled();
  });

  test('discards a response from the previous page', async () => {
    let resolveFirst: ((counts: StatusCounts) => void) | undefined;
    const first = new Promise<StatusCounts>((resolve) => {
      resolveFirst = resolve;
    });
    const refetch = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue({ running: 2 });
    const onCounts = vi.fn();
    const message = { unified_job_id: 1, status: 'running' };
    const { rerender } = render(
      <Test
        lastMessage={null}
        refetch={refetch}
        onCounts={onCounts}
        pageKey="?group_by=status"
      />
    );

    await act(async () => {
      rerender(
        <Test
          lastMessage={message}
          refetch={refetch}
          onCounts={onCounts}
          pageKey="?group_by=status"
        />
      );
      await Promise.resolve();
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <Test
          lastMessage={message}
          refetch={refetch}
          onCounts={onCounts}
          pageKey="?group_by=status&job.page=2"
        />
      );
      await Promise.resolve();
    });

    await act(async () => {
      resolveFirst?.({ running: 1 });
      await Promise.resolve();
    });

    expect(onCounts).not.toHaveBeenCalled();
  });
});
