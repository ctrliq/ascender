import type { useLingui } from '@lingui/react/macro';

/**
 * The `t` a component gets out of useLingui(), for the helpers that are handed
 * it rather than calling the hook themselves.
 *
 * Taken off useLingui's own return type rather than written out, so it keeps
 * step with lingui: `t` is both a tagged template and a function taking a
 * message descriptor, and the two overloads have to stay in sync with the
 * macro that rewrites the call sites.
 */
export type Translate = ReturnType<typeof useLingui>['t'];
