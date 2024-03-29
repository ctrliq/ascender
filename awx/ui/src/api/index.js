import ActivityStream from './models/ActivityStream';
import AdHocCommands from './models/AdHocCommands';
import Applications from './models/Applications';
import Auth from './models/Auth';
import Config from './models/Config';
import CredentialInputSources from './models/CredentialInputSources';
import CredentialTypes from './models/CredentialTypes';
import Credentials from './models/Credentials';
import ConstructedInventories from './models/ConstructedInventories';
import Dashboard from './models/Dashboard';
import ExecutionEnvironments from './models/ExecutionEnvironments';
import Groups from './models/Groups';
import Hosts from './models/Hosts';
import InstanceGroups from './models/InstanceGroups';
import Instances from './models/Instances';
import Inventories from './models/Inventories';
import InventoryScripts from './models/InventoryScripts';
import InventorySources from './models/InventorySources';
import InventoryUpdates from './models/InventoryUpdates';
import JobTemplates from './models/JobTemplates';
import Jobs from './models/Jobs';
import JobEvents from './models/JobEvents';
import Labels from './models/Labels';
import Me from './models/Me';
import Mesh from './models/Mesh';
import Metrics from './models/Metrics';
import NotificationTemplates from './models/NotificationTemplates';
import Notifications from './models/Notifications';
import Organizations from './models/Organizations';
import ProjectUpdates from './models/ProjectUpdates';
import Projects from './models/Projects';
import ReceptorAddresses from './models/Receptor';
import Roles from './models/Roles';
import Root from './models/Root';
import Schedules from './models/Schedules';
import Settings from './models/Settings';
import SubscriptionUsage from './models/SubscriptionUsage';
import SystemJobs from './models/SystemJobs';
import SystemJobTemplates from './models/SystemJobTemplates';
import Teams from './models/Teams';
import Tokens from './models/Tokens';
import UnifiedJobTemplates from './models/UnifiedJobTemplates';
import UnifiedJobs from './models/UnifiedJobs';
import Users from './models/Users';
import WorkflowApprovals from './models/WorkflowApprovals';
import WorkflowApprovalTemplates from './models/WorkflowApprovalTemplates';
import WorkflowJobTemplateNodes from './models/WorkflowJobTemplateNodes';
import WorkflowJobTemplates from './models/WorkflowJobTemplates';
import WorkflowJobs from './models/WorkflowJobs';
import HostMetrics from './models/HostMetrics';

const ActivityStreamAPI = new ActivityStream();
const AdHocCommandsAPI = new AdHocCommands();
const ApplicationsAPI = new Applications();
const AuthAPI = new Auth();
const ConfigAPI = new Config();
const CredentialInputSourcesAPI = new CredentialInputSources();
const CredentialTypesAPI = new CredentialTypes();
const CredentialsAPI = new Credentials();
const ConstructedInventoriesAPI = new ConstructedInventories();
const DashboardAPI = new Dashboard();
const ExecutionEnvironmentsAPI = new ExecutionEnvironments();
const GroupsAPI = new Groups();
const HostsAPI = new Hosts();
const InstanceGroupsAPI = new InstanceGroups();
const InstancesAPI = new Instances();
const InventoriesAPI = new Inventories();
const InventoryScriptsAPI = new InventoryScripts();
const InventorySourcesAPI = new InventorySources();
const InventoryUpdatesAPI = new InventoryUpdates();
const JobTemplatesAPI = new JobTemplates();
const JobsAPI = new Jobs();
const JobEventsAPI = new JobEvents();
const LabelsAPI = new Labels();
const MeAPI = new Me();
const MeshAPI = new Mesh();
const MetricsAPI = new Metrics();
const NotificationTemplatesAPI = new NotificationTemplates();
const NotificationsAPI = new Notifications();
const OrganizationsAPI = new Organizations();
const ProjectUpdatesAPI = new ProjectUpdates();
const ProjectsAPI = new Projects();
const ReceptorAPI = new ReceptorAddresses();
const RolesAPI = new Roles();
const RootAPI = new Root();
const SchedulesAPI = new Schedules();
const SettingsAPI = new Settings();
const SubscriptionUsageAPI = new SubscriptionUsage();
const SystemJobsAPI = new SystemJobs();
const SystemJobTemplatesAPI = new SystemJobTemplates();
const TeamsAPI = new Teams();
const TokensAPI = new Tokens();
const UnifiedJobTemplatesAPI = new UnifiedJobTemplates();
const UnifiedJobsAPI = new UnifiedJobs();
const UsersAPI = new Users();
const WorkflowApprovalsAPI = new WorkflowApprovals();
const WorkflowApprovalTemplatesAPI = new WorkflowApprovalTemplates();
const WorkflowJobTemplateNodesAPI = new WorkflowJobTemplateNodes();
const WorkflowJobTemplatesAPI = new WorkflowJobTemplates();
const WorkflowJobsAPI = new WorkflowJobs();
const HostMetricsAPI = new HostMetrics();

export {
  ActivityStreamAPI,
  AdHocCommandsAPI,
  ApplicationsAPI,
  AuthAPI,
  ConfigAPI,
  CredentialInputSourcesAPI,
  CredentialTypesAPI,
  CredentialsAPI,
  ConstructedInventoriesAPI,
  DashboardAPI,
  ExecutionEnvironmentsAPI,
  GroupsAPI,
  HostsAPI,
  InstanceGroupsAPI,
  InstancesAPI,
  InventoriesAPI,
  InventoryScriptsAPI,
  InventorySourcesAPI,
  InventoryUpdatesAPI,
  JobTemplatesAPI,
  JobsAPI,
  JobEventsAPI,
  LabelsAPI,
  MeAPI,
  MeshAPI,
  MetricsAPI,
  NotificationTemplatesAPI,
  NotificationsAPI,
  OrganizationsAPI,
  ProjectUpdatesAPI,
  ProjectsAPI,
  ReceptorAPI,
  RolesAPI,
  RootAPI,
  SchedulesAPI,
  SettingsAPI,
  SubscriptionUsageAPI,
  SystemJobsAPI,
  SystemJobTemplatesAPI,
  TeamsAPI,
  TokensAPI,
  UnifiedJobTemplatesAPI,
  UnifiedJobsAPI,
  UsersAPI,
  WorkflowApprovalsAPI,
  WorkflowApprovalTemplatesAPI,
  WorkflowJobTemplateNodesAPI,
  WorkflowJobTemplatesAPI,
  WorkflowJobsAPI,
  HostMetricsAPI,
};
