import type { ApiEntity, Untyped } from 'types/api';

/**
 * The values the ad hoc command wizard collects, which become the body of the
 * POST to an inventory's ad_hoc_commands endpoint.
 *
 * Every field is seeded by mapPropsToValues in AdHocCommandsWizard, so none of
 * them is optional: the wizard's steps edit values that are already there.
 */
export interface AdHocValues {
  limit: string;
  credentials: ApiEntity[];
  module_args: string;
  module_name: string;
  verbosity: number;
  forks: number;
  diff_mode: boolean;
  become_enabled: string;
  extra_vars: string;
  job_type: string;
  /** Keyed by the password the chosen credential prompts for. */
  credential_passwords: Record<string, string>;
  execution_environment: Untyped;
  [key: string]: unknown;
}

/** What AdHocCommandsWizard is handed about the hosts or groups selected. */
export interface AdHocItem {
  id: number;
  name: string;
  [key: string]: unknown;
}
