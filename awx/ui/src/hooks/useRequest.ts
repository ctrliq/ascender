import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { parseQueryString, updateQueryString } from 'util/qs';
import type { QSConfig } from 'util/qs';
import useIsMounted from './useIsMounted';

/*
 * The useRequest hook accepts a request function and returns an object with
 * five values:
 *   request: a function to call to invoke the request
 *   result: the value returned from the request function (once invoked)
 *   isLoading: boolean state indicating whether the request is in active/in flight
 *   error: any caught error resulting from the request
 *   setValue: setter to explicitly set the result value
 *
 * The hook also accepts an optional second parameter which is a default
 * value to set as result before the first time the request is made.
 */
/** What every caller of useRequest destructures. */
export interface UseRequest<T, Args extends unknown[]> {
  result: T;
  error: unknown;
  isLoading: boolean;
  request: (...args: Args) => Promise<void>;
  setValue: React.Dispatch<React.SetStateAction<T>>;
}

// Two signatures rather than one: with an initial value the result is never
// undefined, and every caller that destructures it straight away relies on
// that. Without one it starts undefined and callers have to say so.
export default function useRequest<T, Args extends unknown[] = unknown[]>(
  makeRequest: (...args: Args) => Promise<T>,
  initialValue: T
): UseRequest<T, Args>;
export default function useRequest<T, Args extends unknown[] = unknown[]>(
  makeRequest: (...args: Args) => Promise<T>
): UseRequest<T | undefined, Args>;
export default function useRequest<T, Args extends unknown[] = unknown[]>(
  makeRequest: (...args: Args) => Promise<T>,
  initialValue?: T
): UseRequest<T | undefined, Args> {
  const [result, setResult] = useState<T | undefined>(initialValue);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState<boolean>(
    (initialValue as { isLoading?: boolean } | undefined)?.isLoading || false
  );
  const isMounted = useIsMounted();

  return {
    result,
    error,
    isLoading,
    request: useCallback(
      async (...args: Args) => {
        setIsLoading(true);
        try {
          const response = await makeRequest(...args);
          if (isMounted.current) {
            setResult(response);
            setError(null);
          }
        } catch (err) {
          if (isMounted.current) {
            setError(err);
            setResult(initialValue);
          }
        } finally {
          if (isMounted.current) {
            setIsLoading(false);
          }
        }
      },
      /* eslint-disable-next-line react-hooks/exhaustive-deps */
      [makeRequest]
    ),
    setValue: setResult,
  };
}

/*
 * Provides controls for "dismissing" an error message
 *
 * Params: an error object
 * Returns: { error, dismissError }
 *   The returned error object is the same object passed in via the paremeter,
 *   until the dismissError function is called, at which point the returned
 *   error will be set to null on the subsequent render.
 */
export function useDismissableError(error: unknown) {
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (error) {
      setShowError(true);
    }
  }, [error]);

  return {
    error: showError ? error : null,
    dismissError: () => {
      setShowError(false);
    },
  };
}

/*
 * Hook to assist with deletion of items from a paginated item list. The page
 * url will be navigated back one page on a paginated list if needed to prevent
 * the UI from re-loading an empty set and displaying a "No items found"
 * message.
 *
 * Params: a callback function that will be invoked in order to delete items,
 *   and an object with structure { qsConfig, allItemsSelected, fetchItems }
 * Returns: { isLoading, deleteItems, deletionError, clearDeletionError }
 */
export function useDeleteItems(
  makeRequest: () => Promise<unknown>,
  {
    qsConfig = null,
    allItemsSelected = false,
    fetchItems = null,
  }: {
    qsConfig?: QSConfig | null;
    allItemsSelected?: boolean;
    fetchItems?: (() => void) | null;
  } = {}
) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    error: requestError,
    isLoading,
    request,
  } = useRequest(makeRequest, null);
  const { error, dismissError } = useDismissableError(requestError);

  const deleteItems = async () => {
    await request();
    if (!qsConfig) {
      return;
    }
    const params = parseQueryString(qsConfig, location.search);
    // page is a number once parsed, because getQSConfig lists it as an
    // integer field, but the parsed bag holds every kind of query value.
    const page = Number(params.page ?? 1);
    if (page > 1 && allItemsSelected) {
      const qs = updateQueryString(qsConfig, location.search, {
        page: page - 1,
      });
      navigate(`${location.pathname}?${qs}`);
    } else {
      fetchItems?.();
    }
  };

  return {
    isLoading,
    deleteItems,
    deletionError: error,
    clearDeletionError: dismissError,
  };
}
