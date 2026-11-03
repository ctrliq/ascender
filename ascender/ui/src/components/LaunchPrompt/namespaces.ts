/**
 * The namespaces the launch prompt's lists page under in the address.
 *
 * Each is prefixed, because the prompt opens over screens whose own lists
 * page under the plain names: the inventories list is `inventory`, the
 * credentials list `credential`. A modal that forgets its lists as it closes
 * would otherwise clear the search of the list behind it, and a page turn in
 * the modal would turn that list's page too.
 */
const LAUNCH_PROMPT_NAMESPACES = {
  inventory: 'launch-inventory',
  credential: 'launch-credential',
  instanceGroups: 'launch-instance-groups',
  executionEnvironment: 'launch-execution-environment',
} as const;

export default LAUNCH_PROMPT_NAMESPACES;
