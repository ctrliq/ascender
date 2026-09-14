# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Jobs: their output, the events they emit, and what they ran against.

Lifted out of awx/api/views/__init__.py, which had grown to 2,441 lines and
137 classes with no order to them. Nothing here changed on the way across.
"""

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework import status
from ascender.api.generics import (
    APIView,
    GenericCancelView,
    ListAPIView,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    SubListAPIView,
)
from ascender.main import models
from ascender.api import serializers
from ascender.main.constants import ACTIVE_STATES
from ascender.api.views.mixin import UnifiedJobDeletionMixin, NoTruncateMixin, UnifiedJobIncludeMixin
from ascender.api.pagination import UnifiedJobEventPagination, UnifiedJobPagination

# the shared bases these views are built on, which stay where they are
from ascender.api.views import (
    BaseJobEventsList,
    BaseJobHostSummariesList,
    UnifiedJobStdout,
    unpartitioned_event_horizon,
)


class JobList(UnifiedJobIncludeMixin, ListAPIView):
    model = models.Job
    serializer_class = serializers.JobListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # extra_vars/artifacts are large columns that JobListSerializer omits
        # from list responses unless requested via ?include=. Defer the ones
        # that won't be serialized so the DB doesn't read their (potentially
        # TOAST-ed) values. Only safe here because Job is queried directly
        # (unlike the polymorphic UnifiedJobList).
        requested = self.serializer_class.parse_requested_includes(self.request.query_params.get('include', ''))
        to_defer = self.serializer_class.OPTIONAL_INCLUDE_FIELDS - requested
        if to_defer:
            qs = qs.defer(*sorted(to_defer))
        return qs


class JobDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.Job
    serializer_class = serializers.JobDetailSerializer

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        # Only allow changes (PUT/PATCH) when job status is "new".
        if obj.status != 'new':
            return self.http_method_not_allowed(request, *args, **kwargs)
        return super(JobDetail, self).update(request, *args, **kwargs)


class JobCredentialsList(SubListAPIView):
    model = models.Credential
    serializer_class = serializers.CredentialSerializer
    parent_model = models.Job
    relationship = 'credentials'


class JobLabelList(SubListAPIView):
    model = models.Label
    serializer_class = serializers.LabelSerializer
    parent_model = models.Job
    relationship = 'labels'


class JobActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.Job
    relationship = 'activitystream_set'
    search_fields = ('changes',)


class JobCancel(GenericCancelView):
    model = models.Job
    serializer_class = serializers.JobCancelSerializer


class JobRelaunch(RetrieveAPIView):
    model = models.Job
    obj_permission_type = 'start'
    serializer_class = serializers.JobRelaunchSerializer

    def update_raw_data(self, data):
        data = super(JobRelaunch, self).update_raw_data(data)
        try:
            obj = self.get_object()
        except PermissionDenied:
            return data
        if obj:
            needed_passwords = obj.passwords_needed_to_start
            if needed_passwords:
                data['credential_passwords'] = {}
                for p in needed_passwords:
                    data['credential_passwords'][p] = ''
            else:
                data.pop('credential_passwords', None)
        return data

    @transaction.non_atomic_requests
    def dispatch(self, *args, **kwargs):
        return super(JobRelaunch, self).dispatch(*args, **kwargs)

    def check_object_permissions(self, request, obj):
        if request.method == 'POST' and obj:
            relaunch_perm, messages = request.user.can_access_with_errors(self.model, 'start', obj)
            if not relaunch_perm and 'detail' in messages:
                self.permission_denied(request, message=messages['detail'])
        return super(JobRelaunch, self).check_object_permissions(request, obj)

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        context = self.get_serializer_context()

        modified_data = request.data.copy()
        modified_data.setdefault('credential_passwords', {})
        for password in obj.passwords_needed_to_start:
            if password in modified_data:
                modified_data['credential_passwords'][password] = modified_data[password]

        # Note: is_valid() may modify request.data
        # It will remove any key/value pair who's key is not in the 'passwords_needed_to_start' list
        serializer = self.serializer_class(data=modified_data, context=context, instance=obj)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        copy_kwargs = {}
        retry_hosts = serializer.validated_data.get('hosts', None)
        if retry_hosts and retry_hosts != 'all':
            if obj.status in ACTIVE_STATES:
                return Response(
                    {'hosts': _('Wait until job finishes before retrying on {status_value} hosts.').format(status_value=retry_hosts)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            host_qs = obj.retry_qs(retry_hosts)
            if not obj.get_event_queryset().filter(event='playbook_on_stats').exists():
                return Response(
                    {'hosts': _('Cannot retry on {status_value} hosts, playbook stats not available.').format(status_value=retry_hosts)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            retry_host_list = host_qs.values_list('name', flat=True)
            if len(retry_host_list) == 0:
                return Response(
                    {'hosts': _('Cannot relaunch because previous job had 0 {status_value} hosts.').format(status_value=retry_hosts)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            copy_kwargs['limit'] = ','.join(retry_host_list)

        new_job = obj.copy_unified_job(**copy_kwargs)
        result = new_job.signal_start(**serializer.validated_data['credential_passwords'])
        if not result:
            data = dict(msg=_('Error starting job!'))
            new_job.delete()
            return Response(data, status=status.HTTP_400_BAD_REQUEST)
        else:
            data = serializers.JobSerializer(new_job, context=context).data
            # Add job key to match what old relaunch returned.
            data['job'] = new_job.id
            headers = {'Location': new_job.get_absolute_url(request=request)}
            return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class JobCreateSchedule(RetrieveAPIView):
    model = models.Job
    obj_permission_type = 'start'
    serializer_class = serializers.JobCreateScheduleSerializer

    def post(self, request, *args, **kwargs):
        obj = self.get_object()

        if not obj.can_schedule:
            if getattr(obj, 'passwords_needed_to_start', None):
                return Response({"error": _('Cannot create schedule because job requires credential passwords.')}, status=status.HTTP_400_BAD_REQUEST)
            try:
                obj.launch_config
            except ObjectDoesNotExist:
                return Response({"error": _('Cannot create schedule because job was launched by legacy method.')}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"error": _('Cannot create schedule because a related resource is missing.')}, status=status.HTTP_400_BAD_REQUEST)

        config = obj.launch_config

        # Make up a name for the schedule, guarantee that it is unique
        name = 'Auto-generated schedule from job {}'.format(obj.id)
        existing_names = models.Schedule.objects.filter(name__startswith=name).values_list('name', flat=True)
        if name in existing_names:
            idx = 1
            alt_name = '{} - number {}'.format(name, idx)
            while alt_name in existing_names:
                idx += 1
                alt_name = '{} - number {}'.format(name, idx)
            name = alt_name

        schedule_data = dict(
            name=name,
            unified_job_template=obj.unified_job_template,
            enabled=False,
            rrule='{}Z RRULE:FREQ=MONTHLY;INTERVAL=1'.format(now().strftime('DTSTART:%Y%m%dT%H%M%S')),
            extra_data=config.extra_data,
            survey_passwords=config.survey_passwords,
            inventory=config.inventory,
            execution_environment=config.execution_environment,
            char_prompts=config.char_prompts,
            credentials=set(config.credentials.all()),
            labels=set(config.labels.all()),
            instance_groups=list(config.instance_groups.all()),
        )
        if not request.user.can_access(models.Schedule, 'add', schedule_data):
            raise PermissionDenied()

        related_fields = ('credentials', 'labels', 'instance_groups')
        related = [schedule_data.pop(relationship) for relationship in related_fields]
        schedule = models.Schedule.objects.create(**schedule_data)
        for relationship, items in zip(related_fields, related):
            for item in items:
                getattr(schedule, relationship).add(item)

        data = serializers.ScheduleSerializer(schedule, context=self.get_serializer_context()).data
        data.serializer.instance = None  # hack to avoid permissions.py assuming this is Job model
        headers = {'Location': schedule.get_absolute_url(request=request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class JobNotificationsList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.Job
    relationship = 'notifications'
    search_fields = ('subject', 'notification_type', 'body')


class JobJobHostSummariesList(BaseJobHostSummariesList):
    parent_model = models.Job


class JobHostSummaryDetail(RetrieveAPIView):
    model = models.JobHostSummary
    serializer_class = serializers.JobHostSummarySerializer


class JobEventDetail(RetrieveAPIView):
    serializer_class = serializers.JobEventSerializer

    @property
    def is_partitioned(self):
        if 'pk' not in self.kwargs:
            return True
        return int(self.kwargs['pk']) > unpartitioned_event_horizon(models.JobEvent)

    @property
    def model(self):
        if self.is_partitioned:
            return models.JobEvent
        return models.UnpartitionedJobEvent

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(no_truncate=True)
        return context


class JobEventChildrenList(NoTruncateMixin, SubListAPIView):
    serializer_class = serializers.JobEventSerializer
    relationship = 'children'
    name = _('Job Event Children List')
    search_fields = ('stdout',)

    @property
    def is_partitioned(self):
        if 'pk' not in self.kwargs:
            return True
        return int(self.kwargs['pk']) > unpartitioned_event_horizon(models.JobEvent)

    @property
    def model(self):
        if self.is_partitioned:
            return models.JobEvent
        return models.UnpartitionedJobEvent

    @property
    def parent_model(self):
        return self.model

    def get_queryset(self):
        parent_event = self.get_parent_object()
        self.check_parent_access(parent_event)
        return parent_event.job.get_event_queryset().filter(parent_uuid=parent_event.uuid)


class JobJobEventsList(BaseJobEventsList):
    parent_model = models.Job
    pagination_class = UnifiedJobEventPagination

    def get_queryset(self):
        job = self.get_parent_object()
        self.check_parent_access(job)
        return job.get_event_queryset().prefetch_related('job__job_template', 'host').order_by('start_line')


class JobJobEventsChildrenSummary(APIView):
    renderer_classes = [JSONRenderer]
    meta_events = ('debug', 'verbose', 'warning', 'error', 'system_warning', 'deprecated')

    def get(self, request, **kwargs):
        resp = dict(children_summary={}, meta_event_nested_uuid={}, event_processing_finished=False, is_tree=True)
        job = get_object_or_404(models.Job, pk=kwargs['pk'])
        if not job.event_processing_finished:
            return Response(resp)
        else:
            resp["event_processing_finished"] = True

        events = list(job.get_event_queryset().values('counter', 'uuid', 'parent_uuid', 'event').order_by('counter'))
        if len(events) == 0:
            return Response(resp)

        # key is counter, value is number of total children (including children of children, etc.)
        map_counter_children_tally = {i['counter']: {"rowNumber": 0, "numChildren": 0} for i in events}
        # key is uuid, value is counter
        map_uuid_counter = {i['uuid']: i['counter'] for i in events}
        # key is uuid, value is parent uuid. Used as a quick lookup
        map_uuid_puuid = {i['uuid']: i['parent_uuid'] for i in events}
        # key is counter of meta events (i.e. verbose), value is uuid of the assigned parent
        map_meta_counter_nested_uuid = {}

        # collapsible tree view in the UI only makes sense for tree-like
        # hierarchy. If ansible is ran with a strategy like free or host_pinned, then
        # events can be out of sequential order, and no longer follow a tree structure
        # E1
        #  E2
        # E3
        #  E4  <- parent is E3
        #  E5  <- parent is E1
        # in the above, there is no clear way to collapse E1, because E5 comes after
        # E3, which occurs after E1. Thus the tree view should be disabled.

        # mark the last seen uuid at a given level (0-3)
        # if a parent uuid is not in this list, then we know the events are not tree-like
        # and return a response with is_tree: False
        level_current_uuid = [None, None, None, None]

        prev_non_meta_event = events[0]
        for i, e in enumerate(events):
            if e['event'] not in JobJobEventsChildrenSummary.meta_events:
                prev_non_meta_event = e
            if not e['uuid']:
                continue

            if e['event'] not in JobJobEventsChildrenSummary.meta_events:
                level = models.JobEvent.LEVEL_FOR_EVENT[e['event']]
                level_current_uuid[level] = e['uuid']
                # if setting level 1, for example, set levels 2 and 3 back to None
                for u in range(level + 1, len(level_current_uuid)):
                    level_current_uuid[u] = None

            puuid = e['parent_uuid']
            if puuid and puuid not in level_current_uuid:
                # improper tree detected, so bail out early
                resp['is_tree'] = False
                return Response(resp)

            # if event is verbose (or debug, etc), we need to "assign" it a
            # parent. This code looks at the event level of the previous
            # non-verbose event, and the level of the next (by looking ahead)
            # non-verbose event. The verbose event is assigned the same parent
            # uuid of the higher level event.
            # e.g.
            # E1
            #  E2
            # verbose
            # verbose <- we are on this event currently
            #    E4
            # We'll compare E2 and E4, and the verbose event
            # will be assigned the parent uuid of E4 (higher event level)
            if e['event'] in JobJobEventsChildrenSummary.meta_events:
                event_level_before = models.JobEvent.LEVEL_FOR_EVENT[prev_non_meta_event['event']]
                # find next non meta event
                z = i
                next_non_meta_event = events[-1]
                while z < len(events):
                    if events[z]['event'] not in JobJobEventsChildrenSummary.meta_events:
                        next_non_meta_event = events[z]
                        break
                    z += 1
                event_level_after = models.JobEvent.LEVEL_FOR_EVENT[next_non_meta_event['event']]
                if event_level_after and event_level_after > event_level_before:
                    puuid = next_non_meta_event['parent_uuid']
                else:
                    puuid = prev_non_meta_event['parent_uuid']
                if puuid:
                    map_meta_counter_nested_uuid[e['counter']] = puuid
            map_counter_children_tally[e['counter']]['rowNumber'] = i
            if not puuid:
                continue
            # now traverse up the parent, grandparent, etc. events and tally those
            while puuid:
                map_counter_children_tally[map_uuid_counter[puuid]]['numChildren'] += 1
                puuid = map_uuid_puuid.get(puuid, None)

        # create new dictionary, dropping events with 0 children
        resp["children_summary"] = {k: v for k, v in map_counter_children_tally.items() if v['numChildren'] != 0}
        resp["meta_event_nested_uuid"] = map_meta_counter_nested_uuid
        return Response(resp)


class UnifiedJobList(UnifiedJobIncludeMixin, ListAPIView):
    model = models.UnifiedJob
    serializer_class = serializers.UnifiedJobListSerializer
    search_fields = ('description', 'name', 'job__playbook')
    pagination_class = UnifiedJobPagination


class JobStdout(UnifiedJobStdout):
    model = models.Job
