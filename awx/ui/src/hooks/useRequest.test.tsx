import type { QSConfig } from 'util/qs';
import React from 'react';
import { getQSConfig } from 'util/qs';
import { render, act, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../testUtils/rtlContexts';
import useRequest, { useDeleteItems } from './useRequest';

// Both hooks write here, so the slot names each of their results.
const result: {
  current: ReturnType<typeof useRequest> | ReturnType<typeof useDeleteItems>;
} = {
  current: null as unknown as ReturnType<typeof useRequest>,
};
const latest = () => result.current as ReturnType<typeof useRequest>;
const latestDelete = () => result.current as ReturnType<typeof useDeleteItems>;

/** The request each case hands over, which takes whatever that case passes. */
type TestRequest = (...args: never[]) => unknown;

function Test({
  makeRequest,
  initialValue = {},
}: {
  makeRequest: TestRequest;
  initialValue?: unknown;
}) {
  result.current = useRequest(
    makeRequest as (...args: unknown[]) => Promise<unknown>,
    initialValue
  );
  return null;
}

function DeleteTest({
  makeRequest,
  args = {},
}: {
  makeRequest: () => Promise<unknown>;
  args?: {
    qsConfig?: QSConfig | null;
    allItemsSelected?: boolean;
    fetchItems?: (() => void) | null;
  };
}) {
  result.current = useDeleteItems(makeRequest, args);
  return null;
}

describe('useRequest hooks', () => {
  describe('useRequest', () => {
    test('should return initial value as result', () => {
      const makeRequest = vi.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      render(
        <Test
          makeRequest={makeRequest}
          initialValue={{
            initial: true,
          }}
        />
      );

      expect(latest().result).toEqual({
        initial: true,
      });
    });

    test('should return result', async () => {
      const makeRequest = vi.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      render(<Test makeRequest={makeRequest} />);

      await act(async () => {
        await latest().request();
      });
      expect(latest().result).toEqual({ data: 'foo' });
    });

    test('should set isLoading flag', async () => {
      const makeRequest = vi.fn();
      let resolve: (value: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      makeRequest.mockReturnValue(promise);
      render(<Test makeRequest={makeRequest} />);

      let requestPromise: Promise<unknown> | undefined;
      await act(async () => {
        // capture (don't await) the pending request so isLoading stays true
        requestPromise = latest().request();
      });
      expect(latestDelete().isLoading).toEqual(true);
      await act(async () => {
        resolve({ data: 'foo' });
        // await the request inside act so its state updates flush within act
        await requestPromise;
      });
      expect(latestDelete().isLoading).toEqual(false);
      expect(latest().result).toEqual({ data: 'foo' });
    });

    test('should invoke request function', async () => {
      const makeRequest = vi.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      render(<Test makeRequest={makeRequest} />);

      expect(makeRequest).not.toHaveBeenCalled();
      await act(async () => {
        await latest().request();
      });
      expect(makeRequest).toHaveBeenCalledTimes(1);
    });

    test('should return error thrown from request function', async () => {
      const error = new Error('error');
      const makeRequest = () => {
        throw error;
      };
      render(<Test makeRequest={makeRequest} />);

      await act(async () => {
        latest().request();
      });
      expect(latest().error).toEqual(error);
    });

    test('should reset error/result on each request', async () => {
      const error = new Error('error');
      const makeRequest = (throwError?: boolean) => {
        if (throwError) {
          throw error;
        }

        return { data: 'foo' };
      };
      render(<Test makeRequest={makeRequest} />);

      await act(async () => {
        await latest().request(true);
      });
      expect(latest().result).toEqual({});
      expect(latest().error).toEqual(error);
      await act(async () => {
        await latest().request();
      });
      expect(latest().result).toEqual({ data: 'foo' });
      expect(latest().error).toEqual(null);
      await act(async () => {
        await latest().request(true);
      });
      expect(latest().result).toEqual({});
      expect(latest().error).toEqual(error);
    });

    test('should not update state after unmount', async () => {
      const makeRequest = vi.fn();
      let resolve: (value: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      makeRequest.mockReturnValue(promise);
      const { unmount } = render(<Test makeRequest={makeRequest} />);

      expect(makeRequest).not.toHaveBeenCalled();
      await act(async () => {
        latest().request();
      });
      unmount();
      await act(async () => {
        resolve({ data: 'foo' });
      });
    });
  });

  describe('useDeleteItems', () => {
    const qsConfig = getQSConfig('delete-test');

    test('should invoke delete function', async () => {
      const makeRequest = vi.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      renderWithContexts(
        <DeleteTest
          makeRequest={makeRequest}
          args={{
            qsConfig,
            fetchItems: () => {},
          }}
        />
      );

      expect(makeRequest).not.toHaveBeenCalled();
      await act(async () => {
        await latestDelete().deleteItems();
      });
      expect(makeRequest).toHaveBeenCalledTimes(1);
    });

    test('should return error object thrown by function', async () => {
      const error = new Error('error');
      const makeRequest = () => {
        throw error;
      };
      renderWithContexts(
        <DeleteTest
          makeRequest={makeRequest}
          args={{
            qsConfig,
            fetchItems: () => {},
          }}
        />
      );

      await act(async () => {
        await latestDelete().deleteItems();
      });
      await waitFor(() => expect(latestDelete().deletionError).toEqual(error));
    });

    test('should dismiss error', async () => {
      const error = new Error('error');
      const makeRequest = () => {
        throw error;
      };
      renderWithContexts(
        <DeleteTest
          makeRequest={makeRequest}
          args={{
            qsConfig,
            fetchItems: () => {},
          }}
        />
      );

      await act(async () => {
        await latestDelete().deleteItems();
      });
      await waitFor(() => expect(latestDelete().deletionError).toEqual(error));
      await act(async () => {
        latestDelete().clearDeletionError();
      });
      expect(latestDelete().deletionError).toEqual(null);
    });
  });
});
