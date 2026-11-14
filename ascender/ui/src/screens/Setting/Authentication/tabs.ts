import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

/**
 * The five parts of authentication, as the bar at the top of each says.
 *
 * Kept here rather than written out on each screen, so a tab added or renamed
 * is added or renamed once: the pages each render the whole bar, since each is
 * mounted at an address of its own. Providers comes first, since it is where
 * the screen opens, and the rest follow by name so a tab added later has one
 * place to go.
 */
export const AUTHENTICATION_TABS: { label: MessageDescriptor; path: string }[] =
  [
    { label: msg`Providers`, path: '/authentication' },
    { label: msg`Mapping`, path: '/authentication/mapping' },
    { label: msg`Password`, path: '/authentication/password' },
    { label: msg`Session`, path: '/authentication/session' },
    { label: msg`Tokens`, path: '/authentication/tokens' },
  ];

export default AUTHENTICATION_TABS;
