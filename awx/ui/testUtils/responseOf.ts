/**
 * The response a given endpoint answers with.
 *
 * A test fixture carries only the fields its assertions read, never a whole
 * payload, so a mocked endpoint's value is asserted rather than checked. This
 * names what is being asserted to, and follows the model when it changes.
 */
export type ResponseOf<F extends (...args: never[]) => Promise<unknown>> =
  Awaited<ReturnType<F>>;

export default ResponseOf;
