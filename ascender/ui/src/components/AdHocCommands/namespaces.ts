/**
 * The namespaces the ad hoc command wizard's lists page under in the address.
 *
 * Prefixed for the same reason as the launch prompt's: the wizard opens over
 * lists of hosts and inventories whose own namespaces are the plain names,
 * and forgetting the wizard's lists as it closes must leave theirs alone.
 */
const ADHOC_NAMESPACES = {
  credential: 'adhoc-credential',
  executionEnvironment: 'adhoc-execution-environment',
} as const;

export default ADHOC_NAMESPACES;
