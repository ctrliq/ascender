import type { CredentialType } from 'types/api';

/**
 * The lookups that log in as the job, with a token the platform signs for it.
 * Testing one needs a job template to sign the token as.
 */
const WORKLOAD_IDENTITY_LOOKUPS = ['hashivault_kv_oidc', 'hashivault_ssh_oidc'];

/** Every type that depends on the platform issuing a workload identity token. */
const WORKLOAD_IDENTITY_TYPES = [
  ...WORKLOAD_IDENTITY_LOOKUPS,
  'oidc_workload_identity',
];

type Namespaced = Pick<CredentialType, 'namespace'> | null | undefined;

export function isWorkloadIdentityLookup(credentialType: Namespaced) {
  return WORKLOAD_IDENTITY_LOOKUPS.includes(credentialType?.namespace ?? '');
}

export function isWorkloadIdentityType(credentialType: Namespaced) {
  return WORKLOAD_IDENTITY_TYPES.includes(credentialType?.namespace ?? '');
}

/**
 * Lookup metadata as the test endpoint takes it: the template picked to sign
 * the token as goes by id, and is never part of what gets saved.
 */
export function withTestJobTemplate(
  metadata: Record<string, unknown>,
  jobTemplate: { id: number } | null | undefined
) {
  return jobTemplate
    ? { ...metadata, job_template_id: jobTemplate.id }
    : metadata;
}
