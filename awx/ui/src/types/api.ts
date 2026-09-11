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

/**
 * One of the last few runs of a template, as summary_fields inlines them. It is
 * not a job serializer: only these fields come across, which is what the
 * sparkline draws and links to.
 */
export interface RecentJob {
  id: number;
  status?: JobStatus | string;
  finished?: string | null;
  canceled_on?: string | null;
  type?: string;
  [key: string]: unknown;
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
  execution_environment?: SummaryFieldRef & { image?: string };
  instance_group?: SummaryFieldRef;
  credential?: SummaryFieldRef;
  credentials?: SummaryFieldRef[];
  webhook_credential?: SummaryFieldRef & { kind?: string };
  signature_validation_credential?: SummaryFieldRef & { kind?: string };
  default_environment?: SummaryFieldRef & { image?: string };
  resolved_environment?: SummaryFieldRef & { image?: string };
  labels?: { results: (SummaryFieldRef & { name: string })[]; count?: number };
  source_workflow_job?: SummaryFieldRef;
  source_project?: SummaryFieldRef;
  source_credential?: SummaryFieldRef;
  inventory_source?: SummaryFieldRef;
  credential_type?: SummaryFieldRef;
  application?: SummaryFieldRef;
  host?: SummaryFieldRef;
  workflow_job?: SummaryFieldRef;
  workflow_approval?: SummaryFieldRef;
  workflow_approval_template?: SummaryFieldRef & { timeout?: number };
  /** Who the activity stream entry is about, and who it names. */
  actor?: SummaryFieldRef & { username?: string };
  user?: SummaryFieldRef & { username?: string };
  approved_or_denied_by?: SummaryFieldRef & { username?: string };
  /** The role a list row grants, on the row that grants it. */
  role?: SummaryFieldRef & {
    resource_name?: string;
    resource_type?: string;
    resource_type_display_name?: string;
    user_capabilities?: UserCapabilities;
  };
  /** The roles an object offers, which the access lists assign. */
  object_roles?: Record<string, SummaryFieldRef & { description?: string }>;
  /** A job's own state, as the lists and the detail headers read it. */
  job?: SummaryFieldRef & { status?: JobStatus | string };
  last_job?: SummaryFieldRef & {
    status?: JobStatus | string;
    finished?: string | null;
    failed?: boolean;
  };
  current_job?: SummaryFieldRef & { status?: JobStatus | string };
  /** The groups a host belongs to, and the notifications a template sent. */
  group?: SummaryFieldRef[];
  groups?: { count?: number; results?: SummaryFieldRef[] };
  recent_notifications?: (SummaryFieldRef & { status?: string })[];
  related_field_counts?: { teams?: number; users?: number };
  /** The last few runs, which is what the sparkline on a list row draws. */
  recent_jobs?: RecentJob[];
  [key: string]: unknown;
}

/**
 * Replaces the generated `string` on the two fields the schema cannot see.
 *
 * Both are required rather than optional, because the serializers always emit
 * them, and every screen destructures them straight off the object. Their
 * members are all optional, so a sparse one is still described correctly.
 */
type WithNested<T> = Omit<T, 'summary_fields' | 'related'> & {
  summary_fields: SummaryFields;
  related: Record<string, string>;
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
/** webhook_key comes from the template's own endpoint, not the serializer. */
export type WorkflowJobTemplate = WithNested<Schemas['WorkflowJobTemplate']> & {
  webhook_key?: string;
};
export type Inventory = WithNested<Schemas['Inventory']>;

/**
 * A row of /api/v2/unified_jobs/, which lists every kind of job together.
 *
 * The serializer inlines the fields of whichever subclass each row is, and
 * drf-spectacular cannot describe that, so the schema carries only what every
 * job has. The rest are named here, optional, because which of them a row has
 * depends on its `type`.
 */
export type UnifiedJob = WithNested<Schemas['UnifiedJobList']> & {
  /** Jobs: whether this is the parent of a set of job slices. */
  is_sliced_job?: boolean;
  job_type?: string;
  /** Inventory updates: which inventory source plugin ran. */
  source?: string;
  /** Project updates: the branch that was checked out. */
  scm_branch?: string;
  scm_revision?: string;
  job_slice_number?: number;
  job_slice_count?: number;
  inventory?: number | null;
  project?: number | null;
  organization?: number | null;
  credential?: number | null;
  canceled_on?: string | null;
};
export type Host = WithNested<Schemas['Host']>;
/**
 * `webhook_key` is not on the project serializer: the form fetches it from
 * /projects/<id>/webhook_key/ and keeps it alongside the rest.
 */
export type Project = WithNested<Schemas['Project']> & {
  webhook_key?: string;
};

/**
 * The organization's galaxy credentials come from a SerializerMethodField, so
 * the schema does not carry them; the detail screen lists them as chips.
 */
export type Organization = WithNested<Schemas['Organization']> & {
  galaxy_credentials?: SummaryFieldRef[];
};

/**
 * `inputs` is a JSONField, which the schema describes as `unknown`. Its keys
 * are whichever fields the credential's type declares, and their values are
 * what the user entered or `$encrypted$` for a secret the API will not return.
 */
export type Credential = Omit<WithNested<Schemas['Credential']>, 'inputs'> & {
  inputs?: Record<string, unknown>;
};

/**
 * `auth` lists the social backends the account is linked to, and is another
 * SerializerMethodField the schema cannot see. An empty list means the user
 * signs in with a password, which is what the forms and the list row check.
 */
export type User = WithNested<Schemas['User']> & {
  auth?: { provider?: string; backend?: string }[];
};
export type Team = WithNested<Schemas['Team']>;
export type Label = WithNested<Schemas['Label']>;
export type Schedule = WithNested<Schemas['Schedule']>;
export type ExecutionEnvironment = WithNested<Schemas['ExecutionEnvironment']>;
export type InstanceGroup = WithNested<Schemas['InstanceGroup']>;
export type Group = WithNested<Schemas['Group']>;
/**
 * `inputs` and `injectors` are JSONFields, which the schema can only describe
 * as `unknown`: inputs declares the fields a credential of this type asks for,
 * injectors what they become when a job runs.
 */
export type CredentialType = Omit<
  WithNested<Schemas['CredentialType']>,
  'inputs' | 'injectors'
> & {
  inputs?: {
    fields?: Untyped[];
    required?: string[];
    /** The fields an external credential type asks for when it is tested. */
    metadata?: Untyped[];
  };
  injectors?: Record<string, unknown>;
};
export type InventorySource = WithNested<Schemas['InventorySource']>;
export type Instance = WithNested<Schemas['Instance']>;
export type NotificationTemplate = WithNested<Schemas['NotificationTemplate']>;
export type WorkflowApproval = Omit<
  WithNested<Schemas['WorkflowApproval']>,
  'user_has_voted'
> & {
  /** Inlined from the approval template this was created from. */
  timeout?: number;
  /**
   * Whether the current user has already approved or denied this one. It is a
   * SerializerMethodField, which the schema describes as a string.
   */
  user_has_voted?: boolean;
};
export type OAuth2Application = WithNested<Schemas['OAuth2Application']>;
export type OAuth2Token = WithNested<Schemas['OAuth2Token']>;

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
  id?: number;
  type?: string;
  url?: string;
  related?: Record<string, string>;
  summary_fields?: SummaryFields;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * An object a screen hands up so the breadcrumb trail can name it.
 *
 * Only the name is read, and every model the screens resolve carries one, so
 * this stays structural rather than naming the dozen types that satisfy it.
 */
export interface BreadcrumbResource {
  id?: number;
  name?: string | null;
  /** The object's kind, which the screens key their url segment off. */
  type?: string;
}

/**
 * Sets the breadcrumb trail for the screen below from what it has resolved:
 * the resource itself, the object nested under it, and the schedule under
 * that where a screen goes three deep.
 */
export type SetBreadcrumb = (
  resource?: BreadcrumbResource,
  nested?: BreadcrumbResource,
  schedule?: BreadcrumbResource
) => void;

/**
 * A value this migration has not typed yet.
 *
 * Deliberately an alias rather than a bare `any`, so what remains is greppable
 * and countable: `grep -r ': Untyped' src | wc -l` is the size of the debt, and
 * it only ever goes down. Every one of these is a place where the shape could
 * not be derived from the code, because nothing in the tree described it.
 *
 * Replace with a real type when the surrounding area is next worked on. Prefer
 * a generated type from api.generated.ts wherever the value comes from the API.
 */

export type Untyped = any;

/**
 * One column a list can be searched or sorted by, as the list screens declare
 * them and the toolbar renders them.
 *
 * `name` is the label the user picks out of the dropdown and `key` is the query
 * parameter it becomes. Exactly one search column per list carries isDefault,
 * which is the field a bare search term goes to.
 */
export interface SearchColumn {
  name: string;
  key: string;
  isDefault?: boolean;
  isBoolean?: boolean;
  booleanLabels?: { true: string; false: string };
  options?: [string, string][];
}

/** One column a list can be ordered by. */
export interface SortColumn {
  name: string;
  key: string;
}

/**
 * The parts of an API model a shared component is handed as `apiModel`.
 *
 * Several components are reused across resource types and take the model for
 * whichever resource they are showing: the Notifications tab takes whichever
 * model has the notification mixin, the Access tab whichever has the access
 * one. Each is declared with just the methods that component calls, so a model
 * missing one is a type error at the screen that passes it rather than a
 * TypeError at runtime.
 */
export interface NotificationsApiModel {
  readNotificationTemplatesStarted: Untyped;
  readNotificationTemplatesSuccess: Untyped;
  readNotificationTemplatesError: Untyped;
  readNotificationTemplatesApprovals?: Untyped;
  readNotificationTemplatesChanged?: Untyped;
  associateNotificationTemplate: Untyped;
  disassociateNotificationTemplate: Untyped;
}

/** The access list methods the Access tab is handed. */
export interface AccessApiModel {
  readAccessList: Untyped;
  readAccessOptions: Untyped;
}

/** The role association the Add Access wizard is handed. */
export interface RolesApiModel {
  associateRole: Untyped;
}

/** The schedule creation the Add Schedule form is handed. */
export interface SchedulesApiModel {
  createSchedule: Untyped;
}

/**
 * An error as the API layer throws it, which is an axios error with the
 * response attached. Anything caught out of a request is typed `unknown`, so
 * this is what the components that display one assert it to.
 */
export interface DetailedError extends Error {
  response?: {
    status?: number;
    config?: { method?: string; url?: string };
    data?: unknown;
    headers?: Record<string, unknown>;
  };
}
