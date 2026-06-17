import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../testUtils/rtlContexts';
import useRequest, { useDeleteItems } from './useRequest';

const result = { current: null };
const latest = () => result.current;

function Test({ makeRequest, initialValue = {} }) {
  result.current = useRequest(makeRequest, initialValue);
  return null;
}
function DeleteTest({ makeRequest, args = {} }) {
  result.current = useDeleteItems(makeRequest, args);
  return null;
}

describe('useRequest hooks', () => {
  describe('useRequest', () => {
    test('should return initial value as result', () => {
      const makeRequest = jest.fn();
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
      const makeRequest = jest.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      render(<Test makeRequest={makeRequest} />);

      await act(async () => {
        await latest().request();
      });
      expect(latest().result).toEqual({ data: 'foo' });
    });

    test('should set isLoading flag', async () => {
      const makeRequest = jest.fn();
      let resolve;
      const promise = new Promise((r) => {
        resolve = r;
      });
      makeRequest.mockReturnValue(promise);
      render(<Test makeRequest={makeRequest} />);

      let requestPromise;
      await act(async () => {
        // capture (don't await) the pending request so isLoading stays true
        requestPromise = latest().request();
      });
      expect(latest().isLoading).toEqual(true);
      await act(async () => {
        resolve({ data: 'foo' });
        // await the request inside act so its state updates flush within act
        await requestPromise;
      });
      expect(latest().isLoading).toEqual(false);
      expect(latest().result).toEqual({ data: 'foo' });
    });

    test('should invoke request function', async () => {
      const makeRequest = jest.fn();
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
      const makeRequest = (throwError) => {
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
      const makeRequest = jest.fn();
      let resolve;
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
    test('should invoke delete function', async () => {
      const makeRequest = jest.fn();
      makeRequest.mockResolvedValue({ data: 'foo' });
      renderWithContexts(
        <DeleteTest
          makeRequest={makeRequest}
          args={{
            qsConfig: {},
            fetchItems: () => {},
          }}
        />
      );

      expect(makeRequest).not.toHaveBeenCalled();
      await act(async () => {
        await latest().deleteItems();
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
            qsConfig: {},
            fetchItems: () => {},
          }}
        />
      );

      await act(async () => {
        await latest().deleteItems();
      });
      await waitFor(() => expect(latest().deletionError).toEqual(error));
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
            qsConfig: {},
            fetchItems: () => {},
          }}
        />
      );

      await act(async () => {
        await latest().deleteItems();
      });
      await waitFor(() => expect(latest().deletionError).toEqual(error));
      await act(async () => {
        latest().clearDeletionError();
      });
      expect(latest().deletionError).toEqual(null);
    });
  });
});
