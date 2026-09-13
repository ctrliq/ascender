import type {
  LaunchConfig,
  LaunchCredential,
  SummaryFieldRef,
  SurveyConfig,
  SurveyQuestion,
} from 'types/api';

import type { LabelInput } from 'util/labels';

// The launch configuration and the survey are api responses, so they are
// declared with the rest of them; every step reaches them through here.
export type { LaunchConfig, SurveyConfig, SurveyQuestion };

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
  credentials?: LaunchCredential[];
  execution_environment?: SummaryFieldRef | null;
  extra_vars?: string;
  forks?: number;
  instance_groups?: SummaryFieldRef[];
  inventory?: SummaryFieldRef | null;
  job_slice_count?: number;
  job_tags?: string;
  job_type?: string;
  /**
   * The labels the form holds: existing ones carry their numeric id, and one
   * the user typed carries only a name until it is created on save.
   */
  labels?: LabelInput[];
  limit?: string | null;
  scm_branch?: string;
  skip_tags?: string;
  timeout?: number;
  verbosity?: number;
  [surveyVariable: string]: unknown;
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
  /** False where an earlier step is blocked, so the nav cannot skip ahead. */
  canJumpTo?: boolean;
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
  /** The survey step alone passes its spec back, for the preview step. */
  surveyConfig?: SurveyConfig | null;
  setTouched: (setFieldTouched: SetFieldTouched) => void;
  validate: () => void;
}

/** Formik's own setFieldTouched, which each step is handed to mark its own. */
export type SetFieldTouched = (
  field: string,
  touched?: boolean,
  shouldValidate?: boolean
) => void;

/**
 * The tooltips the other prompts step shows, keyed by field.
 *
 * It reads them out of one of two help text modules, a job's or a workflow
 * job template's, and they export different keys: the workflow's has no job
 * type, forks, verbosity, job slicing or timeout, because a workflow prompts
 * for none of them. Every key is therefore optional, and a field only renders
 * where the launch configuration asked for it.
 */
export interface HelpTextSource {
  jobType?: React.ReactNode;
  sourceControlBranch?: React.ReactNode;
  labels?: React.ReactNode;
  forks?: React.ReactNode;
  limit?: React.ReactNode;
  verbosity?: React.ReactNode;
  jobSlicing?: React.ReactNode;
  timeout?: React.ReactNode;
  jobTags?: React.ReactNode;
  skipTags?: React.ReactNode;
}
