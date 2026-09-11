/*
 * The API's own types, with the two things it cannot describe filled in.
 *
 * src/types/api.generated.ts is generated from the serializers by
 * `make ui-api-types` and is the source of truth for every flat field: its
 * nullability, its default, its enum and its help text all come from the
 * backend rather than from someone reading a screen.
 *
 * What it gets wrong is summary_fields and related. AWX builds both in
 * SerializerMethodFields that carry no schema annotation, so drf-spectacular
 * emits them as bare `string` in all 67 schemas that have them. The UI reads
 * summary_fields in over 1,200 places, so leaving that as `string` would make
 * the generated types actively misleading rather than merely incomplete.
 *
 * The right fix is upstream: annotate those methods with @extend_schema_field
 * so the schema describes them, at which point this file loses its Override
 * types and keeps only the aliases. Until then the shapes below are declared
 * here, and they are the only hand-maintained API types in the tree.
 */
import type { components } from './api.generated';

type Schemas = components['schemas'];

/** What the current user may do with a given object. */
export interface UserCapabilities {
  edit?: boolean;
  delete?: boolean;
  start?: boolean;
  schedule?: boolean;
  copy?: boolean;
  adhoc?: boolean;
  [key: string]: boolean | undefined;
}

/** A nested reference to another object, as the API inlines them. */
export interface SummaryFieldRef {
  id: number;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * The nested object the API attaches to almost every response. Only the
 * members the UI actually reads are named; the index signature carries the
 * rest, which differ per endpoint.
 */
export interface SummaryFields {
  user_capabilities?: UserCapabilities;
  created_by?: SummaryFieldRef & { username?: string };
  modified_by?: SummaryFieldRef & { username?: string };
  organization?: SummaryFieldRef;
  inventory?: SummaryFieldRef & { kind?: string };
  project?: SummaryFieldRef & { status?: string };
  job_template?: SummaryFieldRef;
  workflow_job_template?: SummaryFieldRef;
  unified_job_template?: SummaryFieldRef & { unified_job_type?: string };
  schedule?: SummaryFieldRef;
  execution_environment?: SummaryFieldRef;
  instance_group?: SummaryFieldRef;
  credential?: SummaryFieldRef;
  credentials?: SummaryFieldRef[];
  labels?: { results: SummaryFieldRef[]; count?: number };
  source_workflow_job?: SummaryFieldRef;
  recent_jobs?: SummaryFieldRef[];
  [key: string]: unknown;
}

/** Replaces the generated `string` on the two fields the schema cannot see. */
type WithNested<T> = Omit<T, 'summary_fields' | 'related'> & {
  summary_fields?: SummaryFields;
  related?: Record<string, string>;
};

/** A list endpoint's envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Job = WithNested<Schemas['JobDetail']>;
export type JobTemplate = WithNested<Schemas['JobTemplate']>;
export type WorkflowJobTemplate = WithNested<Schemas['WorkflowJobTemplate']>;
export type Inventory = WithNested<Schemas['Inventory']>;
export type Host = WithNested<Schemas['Host']>;
export type Project = WithNested<Schemas['Project']>;
export type Organization = WithNested<Schemas['Organization']>;
export type Credential = WithNested<Schemas['Credential']>;
export type User = WithNested<Schemas['User']>;
export type Team = WithNested<Schemas['Team']>;
export type Label = WithNested<Schemas['Label']>;
export type Schedule = WithNested<Schemas['Schedule']>;
export type ExecutionEnvironment = WithNested<
  Schemas['ExecutionEnvironment']
>;
export type InstanceGroup = WithNested<Schemas['InstanceGroup']>;

/** The job types, which decide which model and which url a job uses. */
export type JobType =
  | 'job'
  | 'ad_hoc_command'
  | 'inventory_update'
  | 'project_update'
  | 'system_job'
  | 'workflow_job';

/** The statuses a job moves through. isJobRunning covers the first four. */
export type JobStatus =
  | 'new'
  | 'pending'
  | 'waiting'
  | 'running'
  | 'successful'
  | 'failed'
  | 'error'
  | 'canceled';

/**
 * Anything the API returns, for the places that genuinely handle more than one
 * kind of object. Prefer a named type above wherever the kind is known.
 */
export interface ApiEntity {
  id: number;
  type: string;
  url: string;
  related?: Record<string, string>;
  summary_fields?: SummaryFields;
  name?: string;
  description?: string;
  [key: string]: unknown;
}
