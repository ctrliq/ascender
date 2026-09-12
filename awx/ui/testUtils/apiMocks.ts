import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ApiResponse, OptionsResponse } from '../src/types/api';

/** The shape of the readOptions every model inherits from Base. */
type ReadOptions = <T = OptionsResponse>() => Promise<ApiResponse<T>>;

/**
 * Gives one model its own mock of a method it inherits from Base.
 *
 * Base declares read-options, destroy, cancel and the rest once, and the
 * models inherit them, so vitest's automock replaces a single function on the
 * shared prototype: reaching one through vi.mocked(SomeAPI.destroy) hands
 * every model the same mock, whichever call ran last decides what they all
 * answer, and a count asserted against one of them counts every model's
 * calls. Assigning to the model shadows the inherited mock for it alone.
 *
 * Args:
 *   api: the model to give its own mock to.
 *   method: the inherited method's name.
 *
 * Returns:
 *   The mock, so a test can assert against this model's calls alone.
 */
export function mockInherited<T extends object, K extends keyof T>(
  api: T,
  method: K
): Mock {
  const fn = vi.fn();
  (api as Record<K, unknown>)[method] = fn;
  return fn;
}

/**
 * Mocks one model's readOptions without touching any other model's.
 *
 * Args:
 *   api: the model whose options are being mocked.
 *   response: the body to answer with, as the endpoint's own data field.
 *
 * Returns:
 *   The mock, for the same reason mockInherited returns one.
 */
export function mockReadOptions<T extends { readOptions: ReadOptions }>(
  api: T,
  response: unknown
): Mock {
  const fn = mockInherited(api, 'readOptions');
  fn.mockResolvedValue({ data: response });
  return fn;
}
