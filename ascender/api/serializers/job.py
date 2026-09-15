# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Jobs and job templates: what launches, what ran, and the events it produced.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from collections import OrderedDict
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils.translation import gettext_lazy as _
from django.utils.encoding import force_str
from rest_framework import serializers
from ascender.main.constants import ACTIVE_STATES
from ascender.main.models import (
    Credential,
    ExecutionEnvironment,
    InstanceGroup,
    Inventory,
    Job,
    JobEvent,
    JobHostSummary,
    JobLaunchConfig,
    JobTemplate,
    Label,
    UnifiedJob,
    UnifiedJobTemplate,
)
from ascender.main.models.base import VERBOSITY_CHOICES, NEW_JOB_TYPE_CHOICES
from ascender.main.utils import getattrd, truncate_stdout
from ascender.main.validators import vars_validate_or_raise
from ascender.api.fields import VerbatimField
from ascender.api.serializers.base import (
    BaseSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
    UnifiedJobTemplateSerializer,
)
from ascender.api.serializers.label import (
    LabelsListMixin,
)


class JobOptionsSerializer(LabelsListMixin, BaseSerializer):
    class Meta:
        fields = (
            '*',
            'job_type',
            'inventory',
            'project',
            'playbook',
            'scm_branch',
            'forks',
            'limit',
            'job_slice_pinned_hosts',
            'verbosity',
            'extra_vars',
            'job_tags',
            'force_handlers',
            'skip_tags',
            'start_at_task',
            'timeout',
            'use_fact_cache',
            'organization',
        )
        read_only_fields = ('organization',)

    def get_related(self, obj):
        res = super(JobOptionsSerializer, self).get_related(obj)
        res['labels'] = self.reverse('api:job_template_label_list', kwargs={'pk': obj.pk})
        try:
            if obj.inventory:
                res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory.pk})
        except ObjectDoesNotExist:
            setattr(obj, 'inventory', None)
        try:
            if obj.project:
                res['project'] = self.reverse('api:project_detail', kwargs={'pk': obj.project.pk})
        except ObjectDoesNotExist:
            setattr(obj, 'project', None)
        if obj.organization_id:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization_id})
        if isinstance(obj, UnifiedJobTemplate):
            res['credentials'] = self.reverse('api:job_template_credentials_list', kwargs={'pk': obj.pk})
        elif isinstance(obj, UnifiedJob):
            res['credentials'] = self.reverse('api:job_credentials_list', kwargs={'pk': obj.pk})

        return res

    def to_representation(self, obj):
        ret = super(JobOptionsSerializer, self).to_representation(obj)
        if obj is None:
            return ret
        if 'inventory' in ret and not obj.inventory:
            ret['inventory'] = None
        if 'project' in ret and not obj.project:
            ret['project'] = None
            if 'playbook' in ret:
                ret['playbook'] = ''
        return ret

    def validate(self, attrs):
        if 'project' in self.fields and 'playbook' in self.fields:
            project = attrs.get('project', self.instance.project if self.instance else None)
            playbook = attrs.get('playbook', self.instance and self.instance.playbook or '')
            scm_branch = attrs.get('scm_branch', self.instance.scm_branch if self.instance else None)
            ask_scm_branch_on_launch = attrs.get('ask_scm_branch_on_launch', self.instance.ask_scm_branch_on_launch if self.instance else None)
            if not project:
                raise serializers.ValidationError({'project': _('This field is required.')})
            playbook_not_found = bool(
                (project and project.scm_type and (not project.allow_override) and playbook and force_str(playbook) not in project.playbook_files)
                or (project and not project.scm_type and playbook and force_str(playbook) not in project.playbooks)  # manual
            )
            if playbook_not_found:
                raise serializers.ValidationError({'playbook': _('Playbook not found for project.')})
            if project and not playbook:
                raise serializers.ValidationError({'playbook': _('Must select playbook for project.')})
            if scm_branch and not project.allow_override:
                raise serializers.ValidationError({'scm_branch': _('Project does not allow overriding branch.')})
            if ask_scm_branch_on_launch and not project.allow_override:
                raise serializers.ValidationError({'ask_scm_branch_on_launch': _('Project does not allow overriding branch.')})

        ret = super(JobOptionsSerializer, self).validate(attrs)
        return ret


class JobTemplateMixin(object):
    """
    Provide recent jobs and survey details in summary_fields
    """

    def _recent_jobs(self, obj):
        # Exclude "joblets", jobs that ran as part of a sliced workflow job
        uj_qs = obj.unifiedjob_unified_jobs.exclude(job__job_slice_count__gt=1).order_by('-created')
        # Would like to apply an .only, but does not play well with non_polymorphic
        # .only('id', 'status', 'finished', 'polymorphic_ctype_id')
        optimized_qs = uj_qs.non_polymorphic()
        return [
            {
                'id': x.id,
                'status': x.status,
                'finished': x.finished,
                'canceled_on': x.canceled_on,
                # Make type consistent with API top-level key, for instance workflow_job
                'type': x.job_type_name,
            }
            for x in optimized_qs[:10]
        ]

    def get_summary_fields(self, obj):
        d = super(JobTemplateMixin, self).get_summary_fields(obj)
        if obj.survey_spec is not None and ('name' in obj.survey_spec and 'description' in obj.survey_spec):
            d['survey'] = dict(title=obj.survey_spec['name'], description=obj.survey_spec['description'])
        d['recent_jobs'] = self._recent_jobs(obj)
        return d

    def validate(self, attrs):
        webhook_service = attrs.get('webhook_service', getattr(self.instance, 'webhook_service', None))
        webhook_credential = attrs.get('webhook_credential', getattr(self.instance, 'webhook_credential', None))

        if attrs.get('webhook_key') and not webhook_service:
            raise serializers.ValidationError({'webhook_key': _("Cannot set a webhook key without a webhook service.")})

        if webhook_credential:
            if webhook_credential.credential_type.kind != 'token':
                raise serializers.ValidationError({'webhook_credential': _("Must be a Personal Access Token.")})

            msg = {'webhook_credential': _("Must match the selected webhook service.")}
            if webhook_service:
                if webhook_credential.credential_type.namespace != '{}_token'.format(webhook_service):
                    raise serializers.ValidationError(msg)
            else:
                raise serializers.ValidationError(msg)

        return super().validate(attrs)


class JobTemplateSerializer(JobTemplateMixin, UnifiedJobTemplateSerializer, JobOptionsSerializer):
    show_capabilities = ['start', 'schedule', 'copy', 'edit', 'delete']
    capabilities_prefetch = ['admin', 'execute', {'copy': ['project.use', 'inventory.use']}]

    status = serializers.ChoiceField(choices=JobTemplate.JOB_TEMPLATE_STATUS_CHOICES, read_only=True, required=False)
    webhook_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=64,
        help_text=_('Shared secret that the webhook service will use to sign requests. Leave blank to generate a new one when the webhook service is set.'),
    )

    class Meta:
        model = JobTemplate
        fields = (
            '*',
            'host_config_key',
            'ask_scm_branch_on_launch',
            'ask_diff_mode_on_launch',
            'ask_variables_on_launch',
            'ask_limit_on_launch',
            'ask_tags_on_launch',
            'ask_skip_tags_on_launch',
            'ask_job_type_on_launch',
            'ask_verbosity_on_launch',
            'ask_inventory_on_launch',
            'ask_credential_on_launch',
            'ask_execution_environment_on_launch',
            'ask_labels_on_launch',
            'ask_forks_on_launch',
            'ask_job_slice_count_on_launch',
            'ask_timeout_on_launch',
            'ask_instance_groups_on_launch',
            'survey_enabled',
            'become_enabled',
            'diff_mode',
            'allow_simultaneous',
            'job_slice_count',
            'webhook_service',
            'webhook_credential',
            'webhook_key',
            'prevent_instance_group_fallback',
        )
        read_only_fields = ('*',)

    def get_related(self, obj):
        res = super(JobTemplateSerializer, self).get_related(obj)
        res.update(
            jobs=self.reverse('api:job_template_jobs_list', kwargs={'pk': obj.pk}),
            schedules=self.reverse('api:job_template_schedules_list', kwargs={'pk': obj.pk}),
            activity_stream=self.reverse('api:job_template_activity_stream_list', kwargs={'pk': obj.pk}),
            launch=self.reverse('api:job_template_launch', kwargs={'pk': obj.pk}),
            webhook_key=self.reverse('api:webhook_key', kwargs={'model_kwarg': 'job_templates', 'pk': obj.pk}),
            webhook_receiver=(
                self.reverse('api:webhook_receiver_{}'.format(obj.webhook_service), kwargs={'model_kwarg': 'job_templates', 'pk': obj.pk})
                if obj.webhook_service
                else ''
            ),
            notification_templates_started=self.reverse('api:job_template_notification_templates_started_list', kwargs={'pk': obj.pk}),
            notification_templates_success=self.reverse('api:job_template_notification_templates_success_list', kwargs={'pk': obj.pk}),
            notification_templates_error=self.reverse('api:job_template_notification_templates_error_list', kwargs={'pk': obj.pk}),
            notification_templates_changed=self.reverse('api:job_template_notification_templates_changed_list', kwargs={'pk': obj.pk}),
            access_list=self.reverse('api:job_template_access_list', kwargs={'pk': obj.pk}),
            survey_spec=self.reverse('api:job_template_survey_spec', kwargs={'pk': obj.pk}),
            labels=self.reverse('api:job_template_label_list', kwargs={'pk': obj.pk}),
            object_roles=self.reverse('api:job_template_object_roles_list', kwargs={'pk': obj.pk}),
            instance_groups=self.reverse('api:job_template_instance_groups_list', kwargs={'pk': obj.pk}),
            slice_workflow_jobs=self.reverse('api:job_template_slice_workflow_jobs_list', kwargs={'pk': obj.pk}),
            copy=self.reverse('api:job_template_copy', kwargs={'pk': obj.pk}),
        )
        if obj.host_config_key:
            res['callback'] = self.reverse('api:job_template_callback', kwargs={'pk': obj.pk})
        if obj.organization_id:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization_id})
        if obj.webhook_credential_id:
            res['webhook_credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.webhook_credential_id})
        return res

    def validate(self, attrs):
        def get_field_from_model_or_attrs(fd):
            return attrs.get(fd, self.instance and getattr(self.instance, fd) or None)

        inventory = get_field_from_model_or_attrs('inventory')
        project = get_field_from_model_or_attrs('project')

        if get_field_from_model_or_attrs('host_config_key') and not inventory:
            raise serializers.ValidationError({'host_config_key': _("Cannot enable provisioning callback without an inventory set.")})

        prompting_error_message = _("You must either set a default value or ask to prompt on launch.")
        if project is None:
            raise serializers.ValidationError({'project': _("Job Templates must have a project assigned.")})
        elif inventory is None and not get_field_from_model_or_attrs('ask_inventory_on_launch'):
            raise serializers.ValidationError({'inventory': prompting_error_message})

        return super(JobTemplateSerializer, self).validate(attrs)

    def validate_extra_vars(self, value):
        return vars_validate_or_raise(value)

    def get_summary_fields(self, obj):
        summary_fields = super(JobTemplateSerializer, self).get_summary_fields(obj)
        all_creds = []
        # Organize credential data into multitude of deprecated fields
        if obj.pk:
            for cred in obj.credentials.all():
                summarized_cred = {
                    'id': cred.pk,
                    'name': cred.name,
                    'description': cred.description,
                    'kind': cred.kind,
                    'cloud': cred.credential_type.kind == 'cloud',
                }
                all_creds.append(summarized_cred)
        summary_fields['credentials'] = all_creds
        return summary_fields


class JobTemplateWithSpecSerializer(JobTemplateSerializer):
    """
    Used for activity stream entries.
    """

    class Meta:
        model = JobTemplate
        fields = ('*', 'survey_spec')


class JobSerializer(UnifiedJobSerializer, JobOptionsSerializer):
    passwords_needed_to_start = serializers.ReadOnlyField()
    artifacts = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = (
            '*',
            'job_template',
            'passwords_needed_to_start',
            'allow_simultaneous',
            'artifacts',
            'scm_revision',
            'instance_group',
            'diff_mode',
            'job_slice_number',
            'job_slice_count',
            'webhook_service',
            'webhook_credential',
            'webhook_guid',
        )

    def get_related(self, obj):
        res = super(JobSerializer, self).get_related(obj)
        res.update(
            dict(
                job_events=self.reverse('api:job_job_events_list', kwargs={'pk': obj.pk}),  # TODO: consider adding job_created
                job_host_summaries=self.reverse('api:job_job_host_summaries_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:job_activity_stream_list', kwargs={'pk': obj.pk}),
                notifications=self.reverse('api:job_notifications_list', kwargs={'pk': obj.pk}),
                labels=self.reverse('api:job_label_list', kwargs={'pk': obj.pk}),
                create_schedule=self.reverse('api:job_create_schedule', kwargs={'pk': obj.pk}),
            )
        )
        try:
            if obj.job_template:
                res['job_template'] = self.reverse('api:job_template_detail', kwargs={'pk': obj.job_template.pk})
        except ObjectDoesNotExist:
            setattr(obj, 'job_template', None)
        if obj.can_cancel or True:
            res['cancel'] = self.reverse('api:job_cancel', kwargs={'pk': obj.pk})
        try:
            if obj.project_update:
                res['project_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.project_update.pk})
        except ObjectDoesNotExist:
            pass
        res['relaunch'] = self.reverse('api:job_relaunch', kwargs={'pk': obj.pk})
        return res

    def get_artifacts(self, obj):
        if obj:
            return obj.display_artifacts()
        return {}

    def to_representation(self, obj):
        ret = super(JobSerializer, self).to_representation(obj)
        if obj is None:
            return ret
        if 'job_template' in ret and not obj.job_template:
            ret['job_template'] = None
        if 'extra_vars' in ret:
            ret['extra_vars'] = obj.display_extra_vars()
        return ret

    def get_summary_fields(self, obj):
        summary_fields = super(JobSerializer, self).get_summary_fields(obj)
        all_creds = []
        # Organize credential data into multitude of deprecated fields
        if obj.pk:
            for cred in obj.credentials.all():
                summarized_cred = {
                    'id': cred.pk,
                    'name': cred.name,
                    'description': cred.description,
                    'kind': cred.kind,
                    'cloud': cred.credential_type.kind == 'cloud',
                }
                all_creds.append(summarized_cred)
        summary_fields['credentials'] = all_creds
        return summary_fields


class JobDetailSerializer(JobSerializer):
    playbook_counts = serializers.SerializerMethodField(help_text=_('A count of all plays and tasks for the job run.'))

    class Meta:
        model = Job
        fields = ('*', 'host_status_counts', 'playbook_counts')

    def get_playbook_counts(self, obj):
        task_count = obj.get_event_queryset().filter(event='playbook_on_task_start').count()
        play_count = obj.get_event_queryset().filter(event='playbook_on_play_start').count()

        data = {'play_count': play_count, 'task_count': task_count}

        return data


class JobCancelSerializer(BaseSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        model = Job
        fields = ('can_cancel',)


class JobRelaunchSerializer(BaseSerializer):
    passwords_needed_to_start = serializers.SerializerMethodField()
    retry_counts = serializers.SerializerMethodField()
    hosts = serializers.ChoiceField(
        required=False,
        allow_null=True,
        default='all',
        choices=[('all', _('No change to job limit')), ('failed', _('All failed and unreachable hosts'))],
        write_only=True,
    )
    credential_passwords = VerbatimField(required=True, write_only=True)

    class Meta:
        model = Job
        fields = ('passwords_needed_to_start', 'retry_counts', 'hosts', 'credential_passwords')

    def validate_credential_passwords(self, value):
        pnts = self.instance.passwords_needed_to_start
        missing = set(pnts) - set(key for key in value if value[key])
        if missing:
            raise serializers.ValidationError(_('Missing passwords needed to start: {}'.format(', '.join(missing))))
        return value

    def to_representation(self, obj):
        res = super(JobRelaunchSerializer, self).to_representation(obj)
        view = self.context.get('view', None)
        if hasattr(view, '_raw_data_form_marker'):
            password_keys = dict([(p, '') for p in self.get_passwords_needed_to_start(obj)])
            res.update(password_keys)
        return res

    def get_passwords_needed_to_start(self, obj):
        if obj:
            return obj.passwords_needed_to_start
        return ''

    def get_retry_counts(self, obj):
        if obj.status in ACTIVE_STATES:
            return _('Relaunch by host status not available until job finishes running.')
        data = OrderedDict([])
        for status in self.fields['hosts'].choices.keys():
            data[status] = obj.retry_qs(status).count()
        return data

    def get_validation_exclusions(self, *args, **kwargs):
        r = super(JobRelaunchSerializer, self).get_validation_exclusions(*args, **kwargs)
        r.append('credential_passwords')
        return r

    def validate(self, attrs):
        obj = self.instance
        if obj.project is None:
            raise serializers.ValidationError(dict(errors=[_("Job Template Project is missing or undefined.")]))
        if obj.inventory is None or obj.inventory.pending_deletion:
            raise serializers.ValidationError(dict(errors=[_("Job Template Inventory is missing or undefined.")]))
        attrs = super(JobRelaunchSerializer, self).validate(attrs)
        return attrs


class JobCreateScheduleSerializer(LabelsListMixin, BaseSerializer):
    can_schedule = serializers.SerializerMethodField()
    prompts = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = ('can_schedule', 'prompts')

    def get_can_schedule(self, obj):
        """
        Need both a job template and job prompts to schedule
        """
        return obj.can_schedule

    @staticmethod
    def _summarize(res_name, obj):
        from ascender.api.serializers.base import SUMMARIZABLE_FK_FIELDS

        summary = {}
        for field in SUMMARIZABLE_FK_FIELDS[res_name]:
            summary[field] = getattr(obj, field, None)
        return summary

    def get_prompts(self, obj):
        try:
            config = obj.launch_config
            ret = config.prompts_dict(display=True)
            for field_name in ('inventory', 'execution_environment'):
                if field_name in ret:
                    ret[field_name] = self._summarize(field_name, ret[field_name])
            for field_name, singular in (('credentials', 'credential'), ('instance_groups', 'instance_group')):
                if field_name in ret:
                    ret[field_name] = [self._summarize(singular, obj) for obj in ret[field_name]]
            if 'labels' in ret:
                ret['labels'] = self._summary_field_labels(config)
            return ret
        except JobLaunchConfig.DoesNotExist:
            return {'all': _('Unknown, job may have been run before launch configurations were saved.')}


class JobListSerializer(JobSerializer, UnifiedJobListSerializer):
    pass


class JobHostSummarySerializer(BaseSerializer):
    class Meta:
        model = JobHostSummary
        fields = (
            '*',
            '-name',
            '-description',
            'job',
            'host',
            'constructed_host',
            'host_name',
            'changed',
            'dark',
            'failures',
            'ok',
            'processed',
            'skipped',
            'failed',
            'ignored',
            'rescued',
        )

    def get_related(self, obj):
        res = super(JobHostSummarySerializer, self).get_related(obj)
        res.update(dict(job=self.reverse('api:job_detail', kwargs={'pk': obj.job.pk})))
        if obj.host is not None:
            res.update(dict(host=self.reverse('api:host_detail', kwargs={'pk': obj.host.pk})))
        return res

    def get_summary_fields(self, obj):
        d = super(JobHostSummarySerializer, self).get_summary_fields(obj)
        try:
            d['job']['job_template_id'] = obj.job.job_template.id
            d['job']['job_template_name'] = obj.job.job_template.name
        except (KeyError, AttributeError):
            pass
        return d


class JobEventSerializer(BaseSerializer):
    event_display = serializers.CharField(source='get_event_display2', read_only=True)
    event_level = serializers.IntegerField(read_only=True)

    class Meta:
        model = JobEvent
        fields = (
            '*',
            '-name',
            '-description',
            'job',
            'event',
            'counter',
            'event_display',
            'event_data',
            'event_level',
            'failed',
            'changed',
            'uuid',
            'parent_uuid',
            'host',
            'host_name',
            'playbook',
            'play',
            'task',
            'role',
            'stdout',
            'start_line',
            'end_line',
            'verbosity',
        )

    def get_related(self, obj):
        res = super(JobEventSerializer, self).get_related(obj)
        res.update(dict(job=self.reverse('api:job_detail', kwargs={'pk': obj.job_id})))
        res['children'] = self.reverse('api:job_event_children_list', kwargs={'pk': obj.pk})
        if obj.host_id:
            res['host'] = self.reverse('api:host_detail', kwargs={'pk': obj.host_id})
        return res

    def get_summary_fields(self, obj):
        d = super(JobEventSerializer, self).get_summary_fields(obj)
        try:
            d['job']['job_template_id'] = obj.job.job_template.id
            d['job']['job_template_name'] = obj.job.job_template.name
        except (KeyError, AttributeError):
            pass
        return d

    def to_representation(self, obj):
        data = super(JobEventSerializer, self).to_representation(obj)
        # Show full stdout for playbook_on_* events.
        if obj and obj.event.startswith('playbook_on'):
            return data
        # If the view logic says to not truncate (request was to the detail view or a param was used)
        if self.context.get('no_truncate', False):
            return data
        max_bytes = settings.EVENT_STDOUT_MAX_BYTES_DISPLAY
        if 'stdout' in data:
            data['stdout'] = truncate_stdout(data['stdout'], max_bytes)
        return data


class JobLaunchSerializer(BaseSerializer):
    # Representational fields
    passwords_needed_to_start = serializers.ReadOnlyField()
    can_start_without_user_input = serializers.BooleanField(read_only=True)
    variables_needed_to_start = serializers.ReadOnlyField()
    credential_needed_to_start = serializers.SerializerMethodField()
    inventory_needed_to_start = serializers.SerializerMethodField()
    survey_enabled = serializers.SerializerMethodField()
    job_template_data = serializers.SerializerMethodField()
    defaults = serializers.SerializerMethodField()

    # Accepted on launch fields
    extra_vars = serializers.JSONField(required=False, write_only=True)
    inventory = serializers.PrimaryKeyRelatedField(queryset=Inventory.objects.all(), required=False, write_only=True)
    credentials = serializers.PrimaryKeyRelatedField(many=True, queryset=Credential.objects.all(), required=False, write_only=True)
    credential_passwords = VerbatimField(required=False, write_only=True)
    scm_branch = serializers.CharField(required=False, write_only=True, allow_blank=True, max_length=1024)
    diff_mode = serializers.BooleanField(required=False, write_only=True)
    job_tags = serializers.CharField(required=False, write_only=True, allow_blank=True)
    job_type = serializers.ChoiceField(required=False, choices=NEW_JOB_TYPE_CHOICES, write_only=True)
    skip_tags = serializers.CharField(required=False, write_only=True, allow_blank=True)
    limit = serializers.CharField(required=False, write_only=True, allow_blank=True)
    verbosity = serializers.ChoiceField(required=False, choices=VERBOSITY_CHOICES, write_only=True)
    execution_environment = serializers.PrimaryKeyRelatedField(queryset=ExecutionEnvironment.objects.all(), required=False, write_only=True)
    labels = serializers.PrimaryKeyRelatedField(many=True, queryset=Label.objects.all(), required=False, write_only=True)
    forks = serializers.IntegerField(required=False, write_only=True, min_value=0)
    job_slice_count = serializers.IntegerField(required=False, write_only=True, min_value=0)
    timeout = serializers.IntegerField(required=False, write_only=True)
    instance_groups = serializers.PrimaryKeyRelatedField(many=True, queryset=InstanceGroup.objects.all(), required=False, write_only=True)

    class Meta:
        model = JobTemplate
        fields = (
            'can_start_without_user_input',
            'passwords_needed_to_start',
            'extra_vars',
            'inventory',
            'scm_branch',
            'limit',
            'job_tags',
            'skip_tags',
            'job_type',
            'verbosity',
            'diff_mode',
            'credentials',
            'credential_passwords',
            'ask_scm_branch_on_launch',
            'ask_variables_on_launch',
            'ask_tags_on_launch',
            'ask_diff_mode_on_launch',
            'ask_skip_tags_on_launch',
            'ask_job_type_on_launch',
            'ask_limit_on_launch',
            'ask_verbosity_on_launch',
            'ask_inventory_on_launch',
            'ask_credential_on_launch',
            'ask_execution_environment_on_launch',
            'ask_labels_on_launch',
            'ask_forks_on_launch',
            'ask_job_slice_count_on_launch',
            'ask_timeout_on_launch',
            'ask_instance_groups_on_launch',
            'survey_enabled',
            'variables_needed_to_start',
            'credential_needed_to_start',
            'inventory_needed_to_start',
            'job_template_data',
            'defaults',
            'verbosity',
            'execution_environment',
            'labels',
            'forks',
            'job_slice_count',
            'timeout',
            'instance_groups',
        )
        read_only_fields = (
            'ask_scm_branch_on_launch',
            'ask_diff_mode_on_launch',
            'ask_variables_on_launch',
            'ask_limit_on_launch',
            'ask_tags_on_launch',
            'ask_skip_tags_on_launch',
            'ask_job_type_on_launch',
            'ask_verbosity_on_launch',
            'ask_inventory_on_launch',
            'ask_credential_on_launch',
            'ask_execution_environment_on_launch',
            'ask_labels_on_launch',
            'ask_forks_on_launch',
            'ask_job_slice_count_on_launch',
            'ask_timeout_on_launch',
            'ask_instance_groups_on_launch',
        )

    def get_credential_needed_to_start(self, obj):
        return False

    def get_inventory_needed_to_start(self, obj):
        return not (obj and obj.inventory)

    def get_survey_enabled(self, obj):
        if obj:
            return obj.survey_enabled and 'spec' in obj.survey_spec
        return False

    def get_defaults(self, obj):
        defaults_dict = {}
        for field_name in JobTemplate.get_ask_mapping().keys():
            if field_name == 'inventory':
                defaults_dict[field_name] = dict(name=getattrd(obj, '%s.name' % field_name, None), id=getattrd(obj, '%s.pk' % field_name, None))
            elif field_name == 'credentials':
                for cred in obj.credentials.all():
                    cred_dict = dict(id=cred.id, name=cred.name, credential_type=cred.credential_type.pk, passwords_needed=cred.passwords_needed)
                    if cred.credential_type.managed and 'vault_id' in cred.credential_type.defined_fields:
                        cred_dict['vault_id'] = cred.get_input('vault_id', default=None)
                    defaults_dict.setdefault(field_name, []).append(cred_dict)
            elif field_name == 'execution_environment':
                if obj.execution_environment_id:
                    defaults_dict[field_name] = {'id': obj.execution_environment.id, 'name': obj.execution_environment.name}
                else:
                    defaults_dict[field_name] = {}
            elif field_name == 'labels':
                for label in obj.labels.all():
                    label_dict = {'id': label.id, 'name': label.name}
                    defaults_dict.setdefault(field_name, []).append(label_dict)
            elif field_name == 'instance_groups':
                defaults_dict[field_name] = []
            else:
                defaults_dict[field_name] = getattr(obj, field_name)
        return defaults_dict

    def get_job_template_data(self, obj):
        return dict(name=obj.name, id=obj.id, description=obj.description)

    def validate_extra_vars(self, value):
        return vars_validate_or_raise(value)

    def validate(self, attrs):
        template = self.context.get('template')

        accepted, rejected, errors = template._accept_or_ignore_job_kwargs(_exclude_errors=['prompts'], **attrs)  # make several error types non-blocking
        self._ignored_fields = rejected

        # Basic validation - cannot run a playbook without a playbook
        if not template.project:
            errors['project'] = _("A project is required to run a job.")
        else:
            failure_reason = template.project.get_reason_if_failed()
            if failure_reason:
                errors['playbook'] = failure_reason

        # cannot run a playbook without an inventory
        if template.inventory and template.inventory.pending_deletion is True:
            errors['inventory'] = _("The inventory associated with this Job Template is being deleted.")
        elif 'inventory' in accepted and accepted['inventory'].pending_deletion:
            errors['inventory'] = _("The provided inventory is being deleted.")

        # Prohibit providing multiple credentials of the same CredentialType.kind
        # or multiples of same vault id
        distinct_cred_kinds = []
        for cred in accepted.get('credentials', []):
            if cred.unique_hash() in distinct_cred_kinds:
                errors.setdefault('credentials', []).append(_('Cannot assign multiple {} credentials.').format(cred.unique_hash(display=True)))
            if cred.credential_type.kind not in ('ssh', 'vault', 'cloud', 'net', 'kubernetes'):
                errors.setdefault('credentials', []).append(_('Cannot assign a Credential of kind `{}`').format(cred.credential_type.kind))
            distinct_cred_kinds.append(cred.unique_hash())

        # Prohibit removing credentials from the JT list (unsupported for now)
        template_credentials = template.credentials.all()
        if 'credentials' in attrs:
            removed_creds = set(template_credentials) - set(attrs['credentials'])
            provided_mapping = Credential.unique_dict(attrs['credentials'])
            for cred in removed_creds:
                if cred.unique_hash() in provided_mapping.keys():
                    continue  # User replaced credential with new of same type
                errors.setdefault('credentials', []).append(
                    _('Removing {} credential at launch time without replacement is not supported. Provided list lacked credential(s): {}.').format(
                        cred.unique_hash(display=True), ', '.join([str(c) for c in removed_creds])
                    )
                )

        # verify that credentials (either provided or existing) don't
        # require launch-time passwords that have not been provided
        if 'credentials' in accepted:
            launch_credentials = Credential.unique_dict(list(template_credentials.all()) + list(accepted['credentials'])).values()
        else:
            launch_credentials = template_credentials
        passwords = attrs.get('credential_passwords', {})  # get from original attrs
        passwords_lacking = []
        for cred in launch_credentials:
            for p in cred.passwords_needed:
                if p not in passwords:
                    passwords_lacking.append(p)
                else:
                    accepted.setdefault('credential_passwords', {})
                    accepted['credential_passwords'][p] = passwords[p]
        if len(passwords_lacking):
            errors['passwords_needed_to_start'] = passwords_lacking

        if errors:
            raise serializers.ValidationError(errors)

        if 'extra_vars' in accepted:
            extra_vars_save = accepted['extra_vars']
        else:
            extra_vars_save = None
        # Validate job against JobTemplate clean_ methods
        accepted = super(JobLaunchSerializer, self).validate(accepted)
        # Preserve extra_vars as dictionary internally
        if extra_vars_save:
            accepted['extra_vars'] = extra_vars_save

        return accepted
