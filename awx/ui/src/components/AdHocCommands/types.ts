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
  /** Null on a serializer that allows a blank name, which is why not string. */
  name?: string | null;
  [key: string]: unknown;
}

/**
 * What each of the ad hoc wizard's use*Step hooks returns.
 *
 * The same arrangement as the launch prompt's LaunchStep: the wizard collects
 * these into one array and reads across it, so they have to agree on the
 * shape. The ad hoc steps take no launch configuration, so there is nothing
 * for them to contribute as initial values.
 */
export interface AdHocStep {
  step: {
    id: string;
    key?: number;
    name: React.ReactNode;
    component: React.ReactNode;
    enableNext?: boolean;
    nextButtonText?: React.ReactNode;
    /** Passed through to the wizard's sidebar entry for this step. */
    stepNavItemProps?: Record<string, unknown>;
  } | null;
  isReady?: boolean;
  contentError?: unknown;
  hasError?: boolean;
  setTouched: (
    setFieldTouched: (
      field: string,
      touched?: boolean,
      shouldValidate?: boolean
    ) => void
  ) => void;
  validate: () => void;
}
