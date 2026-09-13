// lingui compile writes src/locales/<locale>/messages.mjs, which the runner
// and the bundler resolve without the extension. TypeScript resolves neither,
// so the catalogue is declared here.

declare module '*/locales/en/messages' {
  import type { Messages } from '@lingui/core';

  // eslint-disable-next-line import-x/prefer-default-export
  export const messages: Messages;
}
