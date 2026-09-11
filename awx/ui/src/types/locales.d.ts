// lingui compile writes src/locales/<locale>/messages.mjs, which the runner
// and the bundler resolve with or without the extension. TypeScript resolves
// neither, so the catalogue is declared here under both spellings.

declare module '*/locales/en/messages' {
  import type { Messages } from '@lingui/core';

  export const messages: Messages;
}

declare module '*/locales/en/messages.mjs' {
  import type { Messages } from '@lingui/core';

  export const messages: Messages;
}
