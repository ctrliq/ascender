# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The API serializers, one module per resource.

This was a single 6,557 line module. Every name it exported is re-exported
here unchanged, so `from ascender.api import serializers` and each
`serializers.ThingSerializer` that follows it still mean what they did.
"""

from ascender.api.serializers.base import (  # noqa: F401
    BaseSerializer as BaseSerializer,
    BaseSerializerMetaclass as BaseSerializerMetaclass,
    BaseSerializerWithVariables as BaseSerializerWithVariables,
    BaseVariableDataSerializer as BaseVariableDataSerializer,
    CopySerializer as CopySerializer,
    DEFAULT_SUMMARY_FIELDS as DEFAULT_SUMMARY_FIELDS,
    EmptySerializer as EmptySerializer,
    LaunchConfigurationBaseSerializer as LaunchConfigurationBaseSerializer,
    SUMMARIZABLE_FK_FIELDS as SUMMARIZABLE_FK_FIELDS,
    SUPPORTED_UI_LOCALES as SUPPORTED_UI_LOCALES,
    UnifiedJobListSerializer as UnifiedJobListSerializer,
    UnifiedJobSerializer as UnifiedJobSerializer,
    UnifiedJobStdoutSerializer as UnifiedJobStdoutSerializer,
    UnifiedJobTemplateSerializer as UnifiedJobTemplateSerializer,
    logger as logger,
    reverse_gfk as reverse_gfk,
)
from ascender.api.serializers.activity_stream import (  # noqa: F401
    ActivityStreamSerializer as ActivityStreamSerializer,
)
from ascender.api.serializers.ad_hoc_command import (  # noqa: F401
    AdHocCommandCancelSerializer as AdHocCommandCancelSerializer,
    AdHocCommandDetailSerializer as AdHocCommandDetailSerializer,
    AdHocCommandEventSerializer as AdHocCommandEventSerializer,
    AdHocCommandListSerializer as AdHocCommandListSerializer,
    AdHocCommandRelaunchSerializer as AdHocCommandRelaunchSerializer,
    AdHocCommandSerializer as AdHocCommandSerializer,
)
from ascender.api.serializers.host import (  # noqa: F401
    AnsibleFactsSerializer as AnsibleFactsSerializer,
    HostListSerializer as HostListSerializer,
    HostMetricSerializer as HostMetricSerializer,
    HostMetricSummaryMonthlySerializer as HostMetricSummaryMonthlySerializer,
    HostSerializer as HostSerializer,
    HostVariableDataSerializer as HostVariableDataSerializer,
    RECENT_JOBS_COUNT as RECENT_JOBS_COUNT,
    attach_recent_job_host_summaries as attach_recent_job_host_summaries,
)
from ascender.api.serializers.label import (  # noqa: F401
    LabelSerializer as LabelSerializer,
    LabelsListMixin as LabelsListMixin,
)
from ascender.api.serializers.job import (  # noqa: F401
    JobCancelSerializer as JobCancelSerializer,
    JobCreateScheduleSerializer as JobCreateScheduleSerializer,
    JobDetailSerializer as JobDetailSerializer,
    JobEventSerializer as JobEventSerializer,
    JobHostSummarySerializer as JobHostSummarySerializer,
    JobLaunchSerializer as JobLaunchSerializer,
    JobListSerializer as JobListSerializer,
    JobOptionsSerializer as JobOptionsSerializer,
    JobRelaunchSerializer as JobRelaunchSerializer,
    JobSerializer as JobSerializer,
    JobTemplateMixin as JobTemplateMixin,
    JobTemplateSerializer as JobTemplateSerializer,
    JobTemplateWithSpecSerializer as JobTemplateWithSpecSerializer,
)
from ascender.api.serializers.workflow import (  # noqa: F401
    WorkflowApprovalActivityStreamSerializer as WorkflowApprovalActivityStreamSerializer,
    WorkflowApprovalListSerializer as WorkflowApprovalListSerializer,
    WorkflowApprovalSerializer as WorkflowApprovalSerializer,
    WorkflowApprovalTemplateSerializer as WorkflowApprovalTemplateSerializer,
    WorkflowApprovalViewSerializer as WorkflowApprovalViewSerializer,
    WorkflowApprovalVoteSerializer as WorkflowApprovalVoteSerializer,
    WorkflowJobCancelSerializer as WorkflowJobCancelSerializer,
    WorkflowJobLaunchSerializer as WorkflowJobLaunchSerializer,
    WorkflowJobListSerializer as WorkflowJobListSerializer,
    WorkflowJobNodeDetailSerializer as WorkflowJobNodeDetailSerializer,
    WorkflowJobNodeListSerializer as WorkflowJobNodeListSerializer,
    WorkflowJobNodeSerializer as WorkflowJobNodeSerializer,
    WorkflowJobSerializer as WorkflowJobSerializer,
    WorkflowJobTemplateNodeCreateApprovalSerializer as WorkflowJobTemplateNodeCreateApprovalSerializer,
    WorkflowJobTemplateNodeDetailSerializer as WorkflowJobTemplateNodeDetailSerializer,
    WorkflowJobTemplateNodeSerializer as WorkflowJobTemplateNodeSerializer,
    WorkflowJobTemplateSerializer as WorkflowJobTemplateSerializer,
    WorkflowJobTemplateWithSpecSerializer as WorkflowJobTemplateWithSpecSerializer,
    _workflow_node_condition_edges as _workflow_node_condition_edges,
)
from ascender.api.serializers.bulk import (  # noqa: F401
    BulkHostCreateSerializer as BulkHostCreateSerializer,
    BulkHostDeleteSerializer as BulkHostDeleteSerializer,
    BulkHostSerializer as BulkHostSerializer,
    BulkJobLaunchSerializer as BulkJobLaunchSerializer,
    BulkJobNodeSerializer as BulkJobNodeSerializer,
)
from ascender.api.serializers.credential import (  # noqa: F401
    CredentialInputSourceSerializer as CredentialInputSourceSerializer,
    CredentialSerializer as CredentialSerializer,
    CredentialSerializerCreate as CredentialSerializerCreate,
    CredentialTypeSerializer as CredentialTypeSerializer,
)
from ascender.api.serializers.execution_environment import (  # noqa: F401
    ExecutionEnvironmentSerializer as ExecutionEnvironmentSerializer,
)
from ascender.api.serializers.instance import (  # noqa: F401
    InstanceGroupSerializer as InstanceGroupSerializer,
    InstanceHealthCheckSerializer as InstanceHealthCheckSerializer,
    InstanceLinkSerializer as InstanceLinkSerializer,
    InstanceNodeSerializer as InstanceNodeSerializer,
    InstanceSerializer as InstanceSerializer,
    ReceptorAddressSerializer as ReceptorAddressSerializer,
)
from ascender.api.serializers.inventory import (  # noqa: F401
    CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS as CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS,
    ConstructedCharField as ConstructedCharField,
    ConstructedFieldMixin as ConstructedFieldMixin,
    ConstructedIntegerField as ConstructedIntegerField,
    ConstructedInventorySerializer as ConstructedInventorySerializer,
    FederatedInventorySerializer as FederatedInventorySerializer,
    GroupSerializer as GroupSerializer,
    GroupTreeSerializer as GroupTreeSerializer,
    GroupVariableDataSerializer as GroupVariableDataSerializer,
    InventoryScriptSerializer as InventoryScriptSerializer,
    InventorySerializer as InventorySerializer,
    InventorySourceOptionsSerializer as InventorySourceOptionsSerializer,
    InventorySourceSerializer as InventorySourceSerializer,
    InventorySourceUpdateSerializer as InventorySourceUpdateSerializer,
    InventoryUpdateCancelSerializer as InventoryUpdateCancelSerializer,
    InventoryUpdateDetailSerializer as InventoryUpdateDetailSerializer,
    InventoryUpdateEventSerializer as InventoryUpdateEventSerializer,
    InventoryUpdateListSerializer as InventoryUpdateListSerializer,
    InventoryUpdateSerializer as InventoryUpdateSerializer,
    InventoryVariableDataSerializer as InventoryVariableDataSerializer,
)
from ascender.api.serializers.notification import (  # noqa: F401
    NotificationSerializer as NotificationSerializer,
    NotificationTemplateSerializer as NotificationTemplateSerializer,
)
from ascender.api.serializers.oauth2 import (  # noqa: F401
    BaseOAuth2TokenSerializer as BaseOAuth2TokenSerializer,
    OAuth2ApplicationSerializer as OAuth2ApplicationSerializer,
    OAuth2TokenDetailSerializer as OAuth2TokenDetailSerializer,
    OAuth2TokenSerializer as OAuth2TokenSerializer,
)
from ascender.api.serializers.organization import (  # noqa: F401
    OrganizationCredentialSerializerCreate as OrganizationCredentialSerializerCreate,
    OrganizationSerializer as OrganizationSerializer,
)
from ascender.api.serializers.project import (  # noqa: F401
    ProjectInventoriesSerializer as ProjectInventoriesSerializer,
    ProjectOptionsSerializer as ProjectOptionsSerializer,
    ProjectPlaybooksSerializer as ProjectPlaybooksSerializer,
    ProjectSerializer as ProjectSerializer,
    ProjectUpdateCancelSerializer as ProjectUpdateCancelSerializer,
    ProjectUpdateDetailSerializer as ProjectUpdateDetailSerializer,
    ProjectUpdateEventSerializer as ProjectUpdateEventSerializer,
    ProjectUpdateListSerializer as ProjectUpdateListSerializer,
    ProjectUpdateSerializer as ProjectUpdateSerializer,
    ProjectUpdateViewSerializer as ProjectUpdateViewSerializer,
)
from ascender.api.serializers.role import (  # noqa: F401
    RoleSerializer as RoleSerializer,
    RoleSerializerWithParentAccess as RoleSerializerWithParentAccess,
)
from ascender.api.serializers.schedule import (  # noqa: F401
    SchedulePreviewSerializer as SchedulePreviewSerializer,
    ScheduleSerializer as ScheduleSerializer,
)
from ascender.api.serializers.system_job import (  # noqa: F401
    SystemJobCancelSerializer as SystemJobCancelSerializer,
    SystemJobEventSerializer as SystemJobEventSerializer,
    SystemJobListSerializer as SystemJobListSerializer,
    SystemJobSerializer as SystemJobSerializer,
    SystemJobTemplateSerializer as SystemJobTemplateSerializer,
)
from ascender.api.serializers.team import (  # noqa: F401
    TeamCredentialSerializerCreate as TeamCredentialSerializerCreate,
    TeamSerializer as TeamSerializer,
)
from ascender.api.serializers.user import (  # noqa: F401
    ResourceAccessListElementSerializer as ResourceAccessListElementSerializer,
    UserActivityStreamSerializer as UserActivityStreamSerializer,
    UserAuthorizedTokenSerializer as UserAuthorizedTokenSerializer,
    UserCredentialSerializerCreate as UserCredentialSerializerCreate,
    UserPersonalTokenSerializer as UserPersonalTokenSerializer,
    UserSerializer as UserSerializer,
)
