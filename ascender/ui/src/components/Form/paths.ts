/*
 * Field names that are paths.
 *
 * Most names here are a single key, but not all: the schedule subform builds
 * `${prefix}.startDate`, and the credential plugin fields build
 * `inputs.${id}`. So a field name is a path, and reading or writing one has to
 * walk it. Bracket notation is supported because a path is allowed to contain
 * it, not because anything here writes one today.
 */

/** Split a field name into the keys it walks. */
export function toPath(name: string): string[] {
  return name
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((part) => part !== '');
}

/** The value at a path, or undefined if the path runs out. */
export function getIn(source: unknown, name: string): unknown {
  return toPath(name).reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

/**
 * A copy of `source` with `value` at `name`.
 *
 * Every object along the path is copied rather than written through, so a
 * render that compares the old state with the new sees the branch that
 * changed and not the ones that did not.
 */
export function setIn<T>(source: T, name: string, value: unknown): T {
  const path = toPath(name);
  if (path.length === 0) return source;

  const write = (node: unknown, depth: number): unknown => {
    const key = path[depth] as string;
    const last = depth === path.length - 1;
    const isIndex = /^\d+$/.test(key);

    if (Array.isArray(node)) {
      const next = node.slice();
      next[Number(key)] = last ? value : write(node[Number(key)], depth + 1);
      return next;
    }

    let base: Record<string, unknown>;
    if (node && typeof node === 'object') {
      base = { ...(node as Record<string, unknown>) };
    } else {
      // A numeric key on nothing means the path wanted a list there.
      base = isIndex ? ([] as unknown as Record<string, unknown>) : {};
    }
    base[key] = last ? value : write(base[key], depth + 1);
    return base;
  };

  return write(source, 0) as T;
}
