import React from 'react';
import type { DetailedError } from 'types/api';
import ErrorDetail from 'components/ErrorDetail';

/** A run the api refused to start, and what it said when it did. */
export interface NotStarted {
  /** What the run was of, as the list it was picked from names it. */
  name: string;
  /** The refusal, as the request rejected with it. */
  error?: unknown;
}

/**
 * The key under which a launch that moved to the runs list hands over the runs
 * that did not start, in the navigation state.
 */
export const NOT_STARTED_STATE = 'notStarted';

/**
 * Starts one run per item, all at once, and sorts the answers.
 *
 * Every launch is asked for whatever happens to the others, so one refusal
 * does not keep the rest from starting, and each refusal keeps its reason and
 * the name of the item it belongs to.
 *
 * Args:
 *     items: What to start a run of, one each.
 *     start: Starts the run one item stands for.
 *     nameOf: What the item is called, for naming a refusal.
 *
 * Returns:
 *     The answers of the runs that started, in the order they were asked for,
 *     and the refusals, in the same order.
 */
export async function startEach<T, R>(
  items: T[],
  start: (item: T) => Promise<R>,
  nameOf: (item: T) => string
): Promise<{ started: R[]; refused: NotStarted[] }> {
  const answers = await Promise.allSettled(items.map((item) => start(item)));
  const started: R[] = [];
  const refused: NotStarted[] = [];
  answers.forEach((answer, index) => {
    if (answer.status === 'fulfilled') {
      started.push(answer.value);
    } else {
      refused.push({
        name: nameOf(items[index] as T),
        error: answer.reason,
      });
    }
  });
  return { started, refused };
}

/**
 * A refusal reduced to what ErrorDetail shows, which is plain data.
 *
 * Navigation state is structured-cloned by the browser, and a request error
 * carries its config and request objects, functions among them, which would
 * make the navigation throw. The method, the address, the status and the body
 * are what the reader is shown, so those are what is kept.
 *
 * Args:
 *     refused: The runs that did not start.
 *
 * Returns:
 *     The same runs, each with an error that survives being cloned.
 */
export function toNavigationState(refused: NotStarted[]): NotStarted[] {
  return refused.map(({ name, error }) => {
    const { name: kind, message, response } = (error ?? {}) as DetailedError;
    return {
      name,
      error: {
        name: typeof kind === 'string' ? kind : 'Error',
        message: typeof message === 'string' ? message : '',
        ...(response
          ? {
              response: {
                status: response.status,
                data: response.data,
                config: {
                  method: response.config?.method,
                  url: response.config?.url,
                },
              },
            }
          : {}),
      },
    };
  });
}

/**
 * Reads the refusals a launch handed over in the navigation state.
 *
 * Args:
 *     state: The location state, whatever put it there.
 *
 * Returns:
 *     The runs that did not start, or an empty list where there were none.
 */
export function readNotStarted(state: unknown): NotStarted[] {
  const handed = (state as Record<string, unknown> | null)?.[NOT_STARTED_STATE];
  return Array.isArray(handed) ? (handed as NotStarted[]) : [];
}

/**
 * Why each of the runs that did not start was refused, under its name.
 *
 * The names alone say what to look at and not what to do about it: a missing
 * credential, a permission, an inventory with no hosts all read the same.
 */
export function NotStartedDetail({ refused }: { refused: NotStarted[] }) {
  if (!refused.some(({ error }) => error)) {
    return null;
  }
  return (
    <div className="ascender-not-started">
      {refused.map(({ name, error }, index) => (
        // Two rows can share a name, and the order is the launch's own.
        // eslint-disable-next-line react/no-array-index-key
        <div key={`${name}-${index}`}>
          <strong>{name}</strong>
          <ErrorDetail error={error} />
        </div>
      ))}
    </div>
  );
}
