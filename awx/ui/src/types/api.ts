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
import type { QSParams } from 'util/qs';
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
  name?: string | null;
  description?: string | null;
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
/** A single API response, in the shape every caller destructures. */
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * A playbook job, as its own detail endpoint returns it.
 *
 * playbook_counts and host_status_counts are SerializerMethodFields, so the
 * schema types both as a bare string; each is an object of counts.
 */
export type Job = Omit<
  WithNested<Schemas['JobDetail']>,
  'playbook_counts' | 'host_status_counts'
> & {
  playbook_counts?: { play_count?: number; task_count?: number };
  host_status_counts?: Record<string, number>;
};
/** webhook_key comes from the template's own endpoint, not the serializer. */
export type JobTemplate = WithNested<Schemas['JobTemplate']> & {
  webhook_key?: string;
};
/** webhook_key comes from the template's own endpoint, not the serializer. */
export type WorkflowJobTemplate = WithNested<Schemas['WorkflowJobTemplate']> & {
  webhook_key?: string;
};
export type Inventory = WithNested<Schemas['Inventory']>;

/**
 * A template of any kind, as the screens that list them all together see it.
 *
 * Job templates, workflow job templates, projects, inventory sources and
 * approval templates all appear as unified job templates, and each has its own
 * serializer. The schema describes only what they share; the rest is optional
 * here because which fields a template has depends on its `type`.
 */
export type AnyUnifiedJobTemplate = Omit<
  WithNested<Schemas['UnifiedJobTemplate']>,
  'status'
> &
  Partial<
    Omit<JobTemplate, 'id' | 'type' | 'summary_fields' | 'related' | 'status'> &
      Omit<
        WorkflowJobTemplate,
        'id' | 'type' | 'summary_fields' | 'related' | 'status'
      > &
      Omit<Project, 'id' | 'type' | 'summary_fields' | 'related' | 'status'>
  > & {
    /**
     * The status is wider than a job template's: a project or an inventory
     * source reports never updated, none, ok, missing or updating as well.
     */
    status?: string;
    /** Approval nodes carry a timeout rather than a template to run. */
    timeout?: number;
  };

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
  is_sliced_job?: boolean | null;
  job_type?: string | null;
  /** Inventory updates: which inventory source plugin ran. */
  source?: string | null;
  /** Project updates: the branch that was checked out. */
  scm_branch?: string | null;
  scm_revision?: string | null;
  job_slice_number?: number;
  job_slice_count?: number;
  inventory?: number | null;
  project?: number | null;
  organization?: number | null;
  credential?: number | null;
  canceled_on?: string | null;
};

/**
 * A job of any type, as the screens shared by all of them see it.
 *
 * The output and detail screens are reached for jobs, project updates,
 * inventory updates, ad hoc commands, system jobs and workflow jobs alike,
 * and each has its own detail serializer. Every one of them carries an id and
 * a type; the rest is optional here because which fields a job has depends on
 * which kind of job it is, and the screens branch on `type` to find out.
 */
export type AnyJob = Pick<UnifiedJob, 'id' | 'type'> &
  Partial<Omit<Job, keyof UnifiedJob> & UnifiedJob>;
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
  /**
   * What a credential list shows for it. Built by the lookup rather than sent:
   * two vault credentials differ only by their vault id, which it appends.
   */
  label?: string;
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
/**
 * An instance group. Its capacities and its job and instance counts are all
 * SerializerMethodFields, which the schema can only describe as strings where
 * the api counts them.
 */
export type InstanceGroup = Omit<
  WithNested<Schemas['InstanceGroup']>,
  | 'capacity'
  | 'consumed_capacity'
  | 'percent_capacity_remaining'
  | 'jobs_running'
  | 'instances'
> & {
  capacity?: number;
  consumed_capacity?: number;
  percent_capacity_remaining?: number;
  jobs_running?: number;
  /** How many instances the group has, not the instances themselves. */
  instances?: number;
};
export type Group = WithNested<Schemas['Group']>;
/**
 * `inputs` and `injectors` are JSONFields, which the schema can only describe
 * as `unknown`: inputs declares the fields a credential of this type asks for,
 * injectors what they become when a job runs.
 */
/**
 * One field a credential type asks for, as its inputs declare it.
 *
 * A field's shape follows what it holds, so only the keys the credential forms
 * read are named here and the rest are left reachable.
 */
export interface CredentialField {
  id: string;
  label?: string;
  type?: string;
  help_text?: string;
  format?: string;
  secret?: boolean;
  multiline?: boolean;
  ask_at_runtime?: boolean;
  choices?: string[];
  default?: unknown;
  [key: string]: unknown;
}

export type CredentialType = Omit<
  WithNested<Schemas['CredentialType']>,
  'inputs' | 'injectors'
> & {
  inputs?: {
    fields?: CredentialField[];
    required?: string[];
    /** The fields an external credential type asks for when it is tested. */
    metadata?: CredentialField[];
  };
  injectors?: Record<string, unknown>;
};
export type InventorySource = WithNested<Schemas['InventorySource']>;
/**
 * An instance in the mesh. `health_check_pending` is a SerializerMethodField,
 * which the schema can only describe as a string: it is a flag, and the lists
 * poll while it is set.
 */
export type Instance = Omit<
  WithNested<Schemas['Instance']>,
  'health_check_pending'
> & {
  health_check_pending?: boolean;
};
/**
 * A notification template. `messages` and `notification_configuration` are
 * JSONFields, which the schema can only describe as unknown: the first holds
 * the text each outcome sends, the second whatever the chosen type asks for.
 */
export type NotificationTemplate = Omit<
  WithNested<Schemas['NotificationTemplate']>,
  'messages' | 'notification_configuration'
> & {
  messages?: Record<string, unknown> | null;
  notification_configuration?: Record<string, unknown>;
};
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
export type ActivityStreamEntry = WithNested<Schemas['ActivityStream']>;
/**
 * One line of a job's output, as the events endpoint returns it.
 *
 * The events differ by job type and by what the playbook did, so only the
 * fields the tree is built out of are named; the rest arrive alongside them.
 */
export interface JobEventRecord {
  /** The event's position in the job's output, which indexes it here. */
  counter: number;
  /** Every event the api sends carries one; the tree indexes them by it. */
  uuid: string;
  /** Absent on a root level event, which is what puts it at the root. */
  parent_uuid?: string;
  /** Which row of the output list this event draws on, once assigned. */
  rowNumber?: number;
  id?: number;
  /** Which serializer produced it: job_event, project_update_event, ... */
  type?: string | null;
  /** Null on the synthesised event a failed job's traceback is put on. */
  created?: string | null;
  /** The ansible callback that fired, such as playbook_on_task_start. */
  event?: string | null;
  event_data?: Record<string, unknown> | null;
  event_level?: number;
  failed?: boolean;
  changed?: boolean;
  host?: number | null;
  host_name?: string | null;
  play?: string | null;
  task?: string | null;
  playbook?: string | null;
  role?: string | null;
  stdout?: string | null;
  start_line?: number;
  end_line?: number;
  verbosity?: number;
  /** Set when the traceback is all the row has to show. */
  isTracebackOnly?: boolean;
  [key: string]: unknown;
}

export type AdHocCommand = WithNested<Schemas['AdHocCommandDetail']>;
export type ConstructedInventory = WithNested<Schemas['ConstructedInventory']>;

/**
 * An inventory of any kind, as the screens shared by all of them see it.
 *
 * Constructed and federated inventories each have their own serializer, with a
 * few fields the plain one does not carry and without a few it does, so what
 * every kind has is required here and the rest is optional.
 */
export type AnyInventory = Pick<
  Inventory,
  'id' | 'type' | 'summary_fields' | 'related'
> &
  Partial<Inventory & ConstructedInventory & FederatedInventory> & {
    /**
     * Set by the list's websocket hook while one of the inventory's sources
     * is syncing, which the api has no field for.
     */
    isSourceSyncRunning?: boolean;
  };
export type CredentialInputSource = WithNested<
  Schemas['CredentialInputSource']
>;
export type FederatedInventory = WithNested<Schemas['FederatedInventory']>;
export type HostMetric = WithNested<Schemas['HostMetric']>;
export type HostMetricSummaryMonthly = WithNested<
  Schemas['HostMetricSummaryMonthly']
>;
export type InventoryUpdate = WithNested<Schemas['InventoryUpdateDetail']>;
export type Notification = WithNested<Schemas['Notification']>;
export type ProjectUpdate = WithNested<Schemas['ProjectUpdateDetail']>;
export type ReceptorAddress = WithNested<Schemas['ReceptorAddress']>;
/**
 * A role, as the screens that grant and take them away list it.
 *
 * Its summary_fields name the object the role is on, which no other
 * serializer carries, so they are declared here rather than on SummaryFields.
 */
export type Role = Omit<WithNested<Schemas['Role']>, 'summary_fields'> & {
  summary_fields: SummaryFields & {
    resource_name?: string;
    resource_id?: number;
    resource_type?: string;
    resource_type_display_name?: string;
  };
};
/** One user or team on a resource's access list, with the roles it holds. */
export type AccessListEntry = WithNested<Schemas['ResourceAccessListElement']>;
export type SystemJob = WithNested<Schemas['SystemJob']>;
export type SystemJobTemplate = WithNested<Schemas['SystemJobTemplate']>;
export type UnifiedJobTemplateEntry = WithNested<Schemas['UnifiedJobTemplate']>;
export type WorkflowApprovalTemplate = WithNested<
  Schemas['WorkflowApprovalTemplate']
>;
/** One approval or denial of a workflow approval, by the user who cast it. */
export type WorkflowApprovalVote = WithNested<Schemas['WorkflowApprovalVote']>;
export type WorkflowJob = WithNested<Schemas['WorkflowJob']>;
/**
 * One node of a workflow, as its endpoint returns it.
 *
 * condition_edges is a SerializerMethodField, so the schema can only describe
 * it as a string; it lists the conditional links out of this node, each one
 * naming the node it leads to.
 */
export type WorkflowJobTemplateNode = Omit<
  WithNested<Schemas['WorkflowJobTemplateNode']>,
  'condition_edges'
> & {
  condition_edges?: {
    id: number;
    trigger?: unknown;
    artifact_key?: unknown;
    operator?: unknown;
    expected_value?: unknown;
  }[];
};

/**
 * One field, as an OPTIONS response describes it.
 *
 * Which keys a field carries depends on what kind of field it is, so only the
 * ones the screens read are named and the index signature keeps the rest.
 */
export interface OptionsField {
  type?: string;
  label?: string;
  help_text?: string;
  /** What the value is measured in, which a detail shows beside it. */
  unit?: string;
  filterable?: boolean;
  required?: boolean;
  /** Each entry is a value and the label to show for it. */
  choices?: [string | number | null, string][];
  [key: string]: unknown;
}

/**
 * One setting as a settings screen holds it: the OPTIONS block describing the
 * field, with the value the category endpoint returned merged onto it.
 *
 * The detail and edit screens are driven off these rather than off a fixed
 * list of settings, so which keys a category has is the category's business.
 */
export interface SettingConfig {
  type?: string;
  label?: string;
  /**
   * Usually the api's own text. A screen may hand a rendered one instead,
   * where what it has to say depends on what the form currently holds.
   */
  help_text?: React.ReactNode;
  unit?: string;
  required?: boolean;
  /** Each entry is a value and the label to show for it. */
  choices?: [string | number | null, string][];
  value?: unknown;
  default?: unknown;
  /** The bounds a numeric setting is validated against, where it has any. */
  min_value?: number;
  max_value?: number;
  placeholder?: string;
  [key: string]: unknown;
}

/**
 * The api's OPTIONS response, which says what a list can do and be filtered by.
 *
 * `actions` carries one block per method the caller is allowed: GET describes
 * every field the list returns, POST every field it accepts. Both are optional
 * because a caller only gets the block for a method it may use, and because a
 * screen holds an empty one until its own options request lands.
 */
export interface OptionsResponse {
  actions: {
    GET?: Record<string, OptionsField>;
    POST?: Record<string, OptionsField>;
    [method: string]: Record<string, OptionsField> | undefined;
  };
  related_search_fields?: string[];
  [key: string]: unknown;
}

/** Which template a launch is for, as its own launch endpoint names it. */
export interface LaunchTemplateData {
  id?: number;
  name?: string;
  description?: string;
}

/** What a launch default names: an id and a name, either of them absent. */
export interface LaunchRef {
  id?: number | null;
  name?: string | null;
}

/**
 * One credential a template would run with, as the launch endpoint lists it.
 *
 * passwords_needed names the prompts this credential brings with it: a machine
 * credential whose password is set to ask adds ssh_password, and so on.
 */
export interface LaunchCredential extends SummaryFieldRef {
  credential_type?: number;
  passwords_needed?: string[];
  inputs?: Record<string, unknown>;
  vault_id?: string | null;
  /**
   * Present where the credential came from a list rather than from a launch
   * default, which carries only the id, name, type and passwords needed.
   */
  summary_fields?: SummaryFields;
}

/**
 * What a template would run with if the prompt changed nothing.
 *
 * Which of these it carries follows which prompts the template turns on, so
 * they are all optional, and the index signature keeps the rest reachable.
 */
export interface LaunchDefaults {
  credentials?: LaunchCredential[];
  labels?: SummaryFieldRef[];
  instance_groups?: SummaryFieldRef[];
  /**
   * Both come back as an object naming the thing, with a null id and name
   * where the template has none, and an empty one for the environment.
   */
  inventory?: LaunchRef;
  execution_environment?: LaunchRef;
  extra_vars?: string;
  [key: string]: unknown;
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
  /** The values the template already has, which seed the prompt's fields. */
  defaults?: LaunchDefaults;
  inventory_needed_to_start?: boolean;
  /** The template's own id, name and description, for the preview step. */
  job_template_data?: LaunchTemplateData;
  /** The same, where the launch is a workflow job template's. */
  workflow_job_template_data?: LaunchTemplateData;
  /** Names of the credential passwords the launch cannot proceed without. */
  passwords_needed_to_start?: string[];
  survey_enabled?: boolean;
  variables_needed_to_start?: string[];
  [key: string]: unknown;
}

/**
 * What a relaunch endpoint answers on a GET.
 *
 * It is a launch configuration like any other, which is what the prompt takes,
 * and carries two more things: how many hosts a job could be retried against,
 * and whether a project or an inventory source can be updated at all.
 */
export type RelaunchConfig = LaunchConfig & {
  retry_counts?: Record<string, number>;
  can_update?: boolean;
};

/** One question out of a template's survey, as the survey endpoint returns it. */
export interface SurveyQuestion {
  variable: string;
  question_name?: string;
  question_description?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  choices?: string[] | string;
  /** Null where the question's type has no bound to set, such as a choice. */
  min?: number | null;
  max?: number | null;
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

/** The key a template's webhook is signed with, from its own endpoint. */
export interface WebhookKey {
  webhook_key: string;
}

/** When a rule would next fire, which the schedule form previews. */
export interface SchedulePreview {
  local: string[];
  utc: string[];
}

/**
 * The timezones a schedule may be set in.
 *
 * `zones` is every IANA name the server knows; `links` maps each deprecated
 * alias onto the name it now goes by, which the form shows instead.
 */
export interface TimeZones {
  zones: string[];
  links: Record<string, string>;
}

/** How many rows an event has under it, as the job's summary reports. */
export interface ChildrenSummaryEntry {
  rowNumber: number;
  numChildren: number;
}

/** What the children summary endpoint answers with for a job. */
export interface ChildrenSummary {
  /** How many rows sit under each parent event, by the parent's counter. */
  children_summary?: Record<number, ChildrenSummaryEntry>;
  /** The parent a meta event belongs under, by the event's counter. */
  meta_event_nested_uuid?: Record<number, string>;
  /** False while the job is still being processed, when there is no tree. */
  event_processing_finished?: boolean;
  is_tree?: boolean;
}

/**
 * The template a node runs, as far as the visualizer has it.
 *
 * The related endpoints the node view modal reads are attached here too, since
 * it puts what it fetched back onto the node.
 */
export type NodeTemplate = Partial<AnyUnifiedJobTemplate> & {
  instance_groups?: SummaryFieldRef[];
  unified_job_type?: string;
  /** A system job node's own prompt values, which is where days_to_keep sits. */
  extra_data?: Record<string, unknown>;
  /** An approval node's own settings, which no other node type has. */
  context_template?: string;
  required_approvals?: number;
  on_timeout?: string;
};

/**
 * What a launch or a relaunch is started from.
 *
 * The launch button is reached for a template, which it launches, for a job
 * that has already run, which it relaunches, and for a workflow node, which
 * carries its own prompt values, so which fields the resource has follows
 * which of those it is and every one of them is optional here. Named are the
 * ones the launch path itself reads; the rest stay reachable through the index
 * signature, because what the preview step renders is the whole object.
 */
export interface LaunchableResource {
  id?: number;
  type?: string;
  name?: string | null;
  description?: string | null;
  organization?: number | null;
  /** The variables the prompt seeds its editor with, before any override. */
  extra_vars?: string | null;
  /** A workflow node's own prompt values, which the survey step reads. */
  extra_data?: Record<string, unknown>;
  job_type?: string | null;
  limit?: string | null;
  verbosity?: number | null;
  job_tags?: string | null;
  skip_tags?: string | null;
  scm_branch?: string | null;
  diff_mode?: boolean | null;
  forks?: number | null;
  job_slice_count?: number | null;
  timeout?: number | null;
  /**
   * An inventory update relaunches its source rather than itself, and a
   * project update its project, so both are named on the job.
   */
  inventory_source?: number | null;
  project?: number | null;
  summary_fields?: SummaryFields;
  [key: string]: unknown;
}

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
/**
 * A row a selector can work with: anything the api has already given an id.
 *
 * The lists and lookups are generic over it so each one's handlers are called
 * back with the rows it was given rather than with a widest common shape.
 */
export interface SelectableOption {
  id?: number | string;
  [key: string]: unknown;
}

export interface ApiEntity {
  id?: number;
  type?: string;
  url?: string;
  related?: Record<string, string>;
  summary_fields?: SummaryFields;
  name?: string | null;
  description?: string | null;
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
  readNotificationTemplatesStarted: ReadNotifications;
  readNotificationTemplatesSuccess: ReadNotifications;
  readNotificationTemplatesError: ReadNotifications;
  readNotificationTemplatesApprovals?: ReadNotifications;
  readNotificationTemplatesChanged?: ReadNotifications;
  /**
   * Which of the five lists a template is put on is decided by the last
   * argument, which names the state it should notify on: approvals, started,
   * success, error or changed.
   */
  associateNotificationTemplate: (
    resourceId: number | string,
    notificationId: number | string,
    notificationType: string
  ) => Promise<unknown>;
  disassociateNotificationTemplate: (
    resourceId: number | string,
    notificationId: number | string,
    notificationType: string
  ) => Promise<unknown>;
}

/** One of a resource's five notification lists. */
export type ReadNotifications = (
  id: number | string,
  params?: QSParams
) => Promise<ApiResponse<Paginated<NotificationTemplate>>>;

/** The access list methods the Access tab is handed. */
export interface AccessApiModel {
  readAccessList: (
    id: number | string,
    params?: QSParams
  ) => Promise<ApiResponse<Paginated<AccessListEntry>>>;
  readAccessOptions: (
    id: number | string
  ) => Promise<ApiResponse<OptionsResponse>>;
}

/** The role association the Add Access wizard is handed. */
export interface RolesApiModel {
  associateRole: (
    resourceId: number | string,
    roleId: number | string
  ) => Promise<unknown>;
}

/** The schedule creation the Add Schedule form is handed. */
export interface SchedulesApiModel {
  createSchedule: (
    id: number | string,
    data?: unknown
  ) => Promise<ApiResponse<Schedule>>;
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
