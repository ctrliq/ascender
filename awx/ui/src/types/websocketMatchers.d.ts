// vitest-websocket-mock augments @vitest/expect's Assertion with one type
// parameter, where this version of vitest declares it with two, so the two
// declarations do not merge and its matchers are invisible. Declared here
// against vitest's own module instead.

import 'vitest';

declare module 'vitest' {
  interface Assertion {
    toReceiveMessage(
      message: unknown,
      options?: { timeout?: number }
    ): Promise<void>;
    toHaveReceivedMessages(messages: unknown[]): void;
  }
}
