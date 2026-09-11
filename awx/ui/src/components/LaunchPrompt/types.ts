import type { InstanceGroup, Label, Untyped } from 'types/api';

/**
 * The values the launch prompt wizard collects, shared by the wizard itself and
 * by every step that reads them out of Formik.
 *
 * Which of these are present depends on the launch configuration: a template
 * that does not ask for an inventory on launch never sets `inventory`, so all
 * of them are optional and the wizard only posts the ones it was asked for.
 *
 * The survey answers are not here. They live alongside these under keys named
 * by each question's variable, which is what the index signature carries, and
 * getSurveyValues is what separates the two.
 */
export interface LaunchPromptValues {
  credential_passwords?: Record<string, string>;
  credentials?: Untyped[];
  execution_environment?: { id: number } | null;
  extra_vars?: string;
  forks?: number;
  instance_groups?: InstanceGroup[];
  inventory?: { id: number } | null;
  job_slice_count?: number;
  job_tags?: string;
  job_type?: string;
  labels?: Label[];
  limit?: string;
  scm_branch?: string;
  skip_tags?: string;
  timeout?: number;
  verbosity?: number;
  [surveyVariable: string]: unknown;
}

/**
 * What /api/v2/job_templates/N/launch/ returns on a GET, which is what decides
 * which steps the wizard shows and which values it is allowed to post.
 *
 * Every ask_*_on_launch flag turns one prompt on. `defaults` carries the values
 * the template already has, which seed the corresponding fields.
 */
export interface LaunchConfig {
  ask_credential_on_launch?: boolean;
  ask_diff_mode_on_launch?: boolean;
  ask_execution_environment_on_launch?: boolean;
  ask_forks_on_launch?: boolean;
  ask_instance_groups_on_launch?: boolean;
  ask_inventory_on_launch?: boolean;
  ask_job_slice_count_on_launch?: boolean;
  ask_job_type_on_launch?: boolean;
  ask_labels_on_launch?: boolean;
  ask_limit_on_launch?: boolean;
  ask_scm_branch_on_launch?: boolean;
  ask_skip_tags_on_launch?: boolean;
  ask_tags_on_launch?: boolean;
  ask_timeout_on_launch?: boolean;
  ask_variables_on_launch?: boolean;
  ask_verbosity_on_launch?: boolean;
  can_start_without_user_input?: boolean;
  defaults?: Untyped;
  inventory_needed_to_start?: boolean;
  job_template_data?: Untyped;
  /** Names of the credential passwords the launch cannot proceed without. */
  passwords_needed_to_start?: string[];
  survey_enabled?: boolean;
  variables_needed_to_start?: string[];
  [key: string]: unknown;
}

/** One question out of a template's survey, as the survey endpoint returns it. */
export interface SurveyQuestion {
  variable: string;
  question_name?: string;
  question_description?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  choices?: string[] | string;
  min?: number;
  max?: number;
  new_question?: boolean;
  [key: string]: unknown;
}

/** A template's survey, as /survey_spec/ returns it. */
export interface SurveyConfig {
  spec?: SurveyQuestion[];
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Which steps of the wizard the user has already been on, keyed by step id.
 * A step only reports its errors once it has been visited.
 */
export type VisitedSteps = Record<string, boolean>;

/** One step of the wizard, in the shape PatternFly's Wizard takes. */
export interface LaunchStepDefinition {
  id: string;
  /** The wizard's own ordering key, where a step declares one. */
  key?: number;
  name: React.ReactNode;
  component: React.ReactNode;
  enableNext?: boolean;
  nextButtonText?: React.ReactNode;
}

/**
 * What each use*Step hook returns.
 *
 * The wizard collects these into one array and reads across it: which steps to
 * show, whether they are all loaded, which of them have errors, and what each
 * contributes to the form's initial values. That only works if they agree on
 * the shape, so each hook declares this as its return type.
 */
export interface LaunchStep {
  /** Null when the launch configuration does not ask for this step. */
  step: LaunchStepDefinition | null;
  /** What this step adds to the form when the wizard opens. */
  initialValues?: Record<string, unknown>;
  /** False while the step is still fetching what it needs to render. */
  isReady: boolean;
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

/**
 * The tooltip text a prompt field shows, keyed by field name.
 *
 * Each screen has its own help text module and they export different keys: a
 * job template's has playbook and forks, a workflow's does not. The values are
 * mostly rendered text, and a few are functions that take the field's current
 * value. Those modules are still JavaScript, so this stays open until they
 * convert and can be described properly.
 */
export type HelpTextSource = Record<string, Untyped>;
