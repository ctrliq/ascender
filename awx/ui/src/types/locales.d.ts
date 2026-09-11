// lingui compile writes src/locales/<locale>/messages.mjs, which the runner
// and the bundler both resolve without an extension. TypeScript does not
// resolve .mjs that way, so the catalogue is declared here instead.

declare module '*/locales/en/messages' {
  import type { Messages } from '@lingui/core';

  // eslint-disable-next-line import-x/prefer-default-export
  export const messages: Messages;
}
