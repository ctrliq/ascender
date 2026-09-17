# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Python
import dateutil
import html
import itertools
import logging
import re
import sys
import time
from base64 import b64encode
from collections import OrderedDict


# Django
from django.conf import settings
from django.core.exceptions import FieldError
from django.db.models import Sum, Count, Subquery, OuterRef
from django.db import IntegrityError, ProgrammingError, connection
from django.db.models.functions import Trunc
from django.utils.safestring import mark_safe
from django.utils.timezone import now
from django.template.loader import render_to_string
from django.http import StreamingHttpResponse
from django.utils.translation import gettext_lazy as _

# Django REST Framework
from rest_framework.exceptions import APIException, ParseError, NotFound
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer, StaticHTMLRenderer
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import exception_handler, get_view_name
from rest_framework import status

# Ascender YAML parser/renderer (in-tree replacement for djangorestframework-yaml)
from ascender.api.parsers import YAMLParser
from ascender.api.renderers import YAMLRenderer

# Python Social Auth
from social_core.backends.utils import load_backends

# Django OAuth Toolkit

from wsgiref.util import FileWrapper

# Ascender
from ascender.main.access import get_user_queryset
from ascender.api.generics import (
    APIView,
    RetrieveAPIView,
    RetrieveUpdateAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAttachDetachAPIView,
)
from ascender.api.versioning import reverse
from ascender.main import models
from ascender.main.utils import (
    camelcase_to_underscore,
)
from ascender.main.utils.common import memoize
from ascender.main.redact import UriCleaner
from ascender.api.permissions import (
    VariableDataPermission,
)
from ascender.api import renderers
from ascender.api import serializers
from ascender.api.views.mixin import (
    NoTruncateMixin,
)
from ascender.api.pagination import UnifiedJobEventPagination

logger = logging.getLogger('ascender.api.views')


def unpartitioned_event_horizon(cls):
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE table_name = '_unpartitioned_{cls._meta.db_table}';")
        if not cursor.fetchone():
            return 0
    with connection.cursor() as cursor:
        try:
            cursor.execute(f'SELECT MAX(id) FROM _unpartitioned_{cls._meta.db_table}')
            return cursor.fetchone()[0] or -1
        except ProgrammingError:
            return 0


def api_exception_handler(exc, context):
    """
    Override default API exception handler to catch IntegrityError exceptions.
    """
    if isinstance(exc, IntegrityError):
        exc = ParseError(exc.args[0])
    if isinstance(exc, FieldError):
        exc = ParseError(exc.args[0])
    if isinstance(context['view'], UnifiedJobStdout):
        context['view'].renderer_classes = [renderers.BrowsableAPIRenderer, JSONRenderer]
    if isinstance(exc, APIException):
        req = context['request']._request
        if 'ascender.named_url_rewritten' in req.META and not str(getattr(exc, 'status_code', 0)).startswith('2'):
            # if the URL was rewritten, and it's not a 2xx level status code,
            # revert the request.path to its original value to avoid leaking
            # any context about the existence of resources
            req.path = req.META['ascender.named_url_rewritten']
            if exc.status_code == 403:
                exc = NotFound(detail=_('Not found.'))
    return exception_handler(exc, context)


class DashboardView(APIView):
    deprecated = True

    name = _("Dashboard")
    swagger_topic = 'Dashboard'

    def get(self, request, format=None):
        '''Show Dashboard Details'''
        data = OrderedDict()
        data['related'] = {'jobs_graph': reverse('api:dashboard_jobs_graph_view', request=request)}
        user_inventory = get_user_queryset(request.user, models.Inventory)
        inventory_with_failed_hosts = user_inventory.filter(hosts_with_active_failures__gt=0)
        user_inventory_external = user_inventory.filter(has_inventory_sources=True)
        # if there are *zero* inventories, this aggregate query will be None, fall back to 0
        failed_inventory = user_inventory.aggregate(Sum('inventory_sources_with_failures'))['inventory_sources_with_failures__sum'] or 0
        data['inventories'] = {
            'url': reverse('api:inventory_list', request=request),
            'total': user_inventory.count(),
            'total_with_inventory_source': user_inventory_external.count(),
            'job_failed': inventory_with_failed_hosts.count(),
            'inventory_failed': failed_inventory,
        }
        user_inventory_sources = get_user_queryset(request.user, models.InventorySource)
        ec2_inventory_sources = user_inventory_sources.filter(source='ec2')
        ec2_inventory_failed = ec2_inventory_sources.filter(status='failed')
        data['inventory_sources'] = {}
        data['inventory_sources']['ec2'] = {
            'url': reverse('api:inventory_source_list', request=request) + "?source=ec2",
            'failures_url': reverse('api:inventory_source_list', request=request) + "?source=ec2&status=failed",
            'label': 'Amazon EC2',
            'total': ec2_inventory_sources.count(),
            'failed': ec2_inventory_failed.count(),
        }

        user_groups = get_user_queryset(request.user, models.Group)
        groups_inventory_failed = models.Group.objects.filter(inventory_sources__last_job_failed=True).count()
        data['groups'] = {'url': reverse('api:group_list', request=request), 'total': user_groups.count(), 'inventory_failed': groups_inventory_failed}

        user_hosts = get_user_queryset(request.user, models.Host).exclude(inventory__kind='constructed')
        latest_summary_failed = Subquery(models.JobHostSummary.objects.filter(host_id=OuterRef('pk')).order_by('-id').values('failed')[:1])
        user_hosts_failed = user_hosts.annotate(_latest_failed=latest_summary_failed).filter(_latest_failed=True)
        data['hosts'] = {
            'url': reverse('api:host_list', request=request),
            'total': user_hosts.count(),
            'failed': user_hosts_failed.count(),
        }

        user_projects = get_user_queryset(request.user, models.Project)
        user_projects_failed = user_projects.filter(last_job_failed=True)
        data['projects'] = {
            'url': reverse('api:project_list', request=request),
            'failures_url': reverse('api:project_list', request=request) + "?last_job_failed=True",
            'total': user_projects.count(),
            'failed': user_projects_failed.count(),
        }

        git_projects = user_projects.filter(scm_type='git')
        git_failed_projects = git_projects.filter(last_job_failed=True)
        svn_projects = user_projects.filter(scm_type='svn')
        svn_failed_projects = svn_projects.filter(last_job_failed=True)
        archive_projects = user_projects.filter(scm_type='archive')
        archive_failed_projects = archive_projects.filter(last_job_failed=True)
        data['scm_types'] = {}
        data['scm_types']['git'] = {
            'url': reverse('api:project_list', request=request) + "?scm_type=git",
            'label': 'Git',
            'failures_url': reverse('api:project_list', request=request) + "?scm_type=git&last_job_failed=True",
            'total': git_projects.count(),
            'failed': git_failed_projects.count(),
        }
        data['scm_types']['svn'] = {
            'url': reverse('api:project_list', request=request) + "?scm_type=svn",
            'label': 'Subversion',
            'failures_url': reverse('api:project_list', request=request) + "?scm_type=svn&last_job_failed=True",
            'total': svn_projects.count(),
            'failed': svn_failed_projects.count(),
        }
        data['scm_types']['archive'] = {
            'url': reverse('api:project_list', request=request) + "?scm_type=archive",
            'label': 'Remote Archive',
            'failures_url': reverse('api:project_list', request=request) + "?scm_type=archive&last_job_failed=True",
            'total': archive_projects.count(),
            'failed': archive_failed_projects.count(),
        }

        user_list = get_user_queryset(request.user, models.User)
        team_list = get_user_queryset(request.user, models.Team)
        credential_list = get_user_queryset(request.user, models.Credential)
        job_template_list = get_user_queryset(request.user, models.JobTemplate)
        organization_list = get_user_queryset(request.user, models.Organization)
        data['users'] = {'url': reverse('api:user_list', request=request), 'total': user_list.count()}
        data['organizations'] = {'url': reverse('api:organization_list', request=request), 'total': organization_list.count()}
        data['teams'] = {'url': reverse('api:team_list', request=request), 'total': team_list.count()}
        data['credentials'] = {'url': reverse('api:credential_list', request=request), 'total': credential_list.count()}
        data['job_templates'] = {'url': reverse('api:job_template_list', request=request), 'total': job_template_list.count()}
        return Response(data)


class DashboardJobsGraphView(APIView):
    name = _("Dashboard Jobs Graphs")
    swagger_topic = 'Jobs'

    def get(self, request, format=None):
        period = request.query_params.get('period', 'month')
        job_type = request.query_params.get('job_type', 'all')

        user_id = getattr(request.user, 'id', None) or 0
        try:
            payload = self._compute_dashboard_jobs_graph(user_id, period, job_type)
        except ParseError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)

    @staticmethod
    @memoize(ttl=15)
    def _compute_dashboard_jobs_graph(user_id, period, job_type):
        # Debug log when there is a cache miss
        logger.debug('DashboardJobsGraphView cache miss: user_id=%s period=%s job_type=%s', user_id, period, job_type)
        # Validate period. Raise exception to let caller return 400 error in response
        if period not in ('month', 'two_weeks', 'week', 'day'):
            raise ParseError(_('Unknown period "%s"') % str(period))

        user = models.User.objects.get(pk=user_id) if user_id else None
        user_unified_jobs = get_user_queryset(user, models.UnifiedJob).exclude(launch_type='sync')

        success_query = user_unified_jobs.filter(status='successful')
        failed_query = user_unified_jobs.filter(status='failed')
        canceled_query = user_unified_jobs.filter(status='canceled')
        error_query = user_unified_jobs.filter(status='error')

        if job_type == 'inv_sync':
            success_query = success_query.filter(instance_of=models.InventoryUpdate)
            failed_query = failed_query.filter(instance_of=models.InventoryUpdate)
            canceled_query = canceled_query.filter(instance_of=models.InventoryUpdate)
            error_query = error_query.filter(instance_of=models.InventoryUpdate)
        elif job_type == 'playbook_run':
            success_query = success_query.filter(instance_of=models.Job)
            failed_query = failed_query.filter(instance_of=models.Job)
            canceled_query = canceled_query.filter(instance_of=models.Job)
            error_query = error_query.filter(instance_of=models.Job)
        elif job_type == 'scm_update':
            success_query = success_query.filter(instance_of=models.ProjectUpdate)
            failed_query = failed_query.filter(instance_of=models.ProjectUpdate)
            canceled_query = canceled_query.filter(instance_of=models.ProjectUpdate)
            error_query = error_query.filter(instance_of=models.ProjectUpdate)

        end = now()
        interval = 'day'
        if period == 'month':
            start = end - dateutil.relativedelta.relativedelta(months=1)
        elif period == 'two_weeks':
            start = end - dateutil.relativedelta.relativedelta(weeks=2)
        elif period == 'week':
            start = end - dateutil.relativedelta.relativedelta(weeks=1)
        elif period == 'day':
            start = end - dateutil.relativedelta.relativedelta(days=1)
            interval = 'hour'

        dashboard_data = {"jobs": {"successful": [], "failed": [], "canceled": [], "error": []}}

        succ_list = dashboard_data['jobs']['successful']
        fail_list = dashboard_data['jobs']['failed']
        canceled_list = dashboard_data['jobs']['canceled']
        error_list = dashboard_data['jobs']['error']

        qs_s = (
            success_query.filter(finished__range=(start, end))
            .annotate(d=Trunc('finished', interval, tzinfo=end.tzinfo))
            .order_by()
            .values('d')
            .annotate(agg=Count('id', distinct=True))
        )
        data_s = {item['d']: item['agg'] for item in qs_s}
        qs_f = (
            failed_query.filter(finished__range=(start, end))
            .annotate(d=Trunc('finished', interval, tzinfo=end.tzinfo))
            .order_by()
            .values('d')
            .annotate(agg=Count('id', distinct=True))
        )
        data_f = {item['d']: item['agg'] for item in qs_f}
        qs_c = (
            canceled_query.filter(finished__range=(start, end))
            .annotate(d=Trunc('finished', interval, tzinfo=end.tzinfo))
            .order_by()
            .values('d')
            .annotate(agg=Count('id', distinct=True))
        )
        data_c = {item['d']: item['agg'] for item in qs_c}
        qs_e = (
            error_query.filter(finished__range=(start, end))
            .annotate(d=Trunc('finished', interval, tzinfo=end.tzinfo))
            .order_by()
            .values('d')
            .annotate(agg=Count('id', distinct=True))
        )
        data_e = {item['d']: item['agg'] for item in qs_e}

        start_date = start.replace(hour=0, minute=0, second=0, microsecond=0)
        for d in itertools.count():
            date = start_date + dateutil.relativedelta.relativedelta(days=d)
            if date > end:
                break
            succ_list.append([time.mktime(date.timetuple()), data_s.get(date, 0)])
            fail_list.append([time.mktime(date.timetuple()), data_f.get(date, 0)])
            canceled_list.append([time.mktime(date.timetuple()), data_c.get(date, 0)])
            error_list.append([time.mktime(date.timetuple()), data_e.get(date, 0)])

        return dashboard_data


class LaunchConfigCredentialsBase(SubListAttachDetachAPIView):
    model = models.Credential
    serializer_class = serializers.CredentialSerializer
    relationship = 'credentials'

    def is_valid_relation(self, parent, sub, created=False):
        if not parent.unified_job_template:
            return {"msg": _("Cannot assign credential when related template is null.")}

        ask_mapping = parent.unified_job_template.get_ask_mapping()

        if self.relationship not in ask_mapping:
            return {"msg": _("Related template cannot accept {} on launch.").format(self.relationship)}
        elif sub.passwords_needed:
            return {"msg": _("Credential that requires user input on launch cannot be used in saved launch configuration.")}

        ask_field_name = ask_mapping[self.relationship]

        if not getattr(parent.unified_job_template, ask_field_name):
            return {"msg": _("Related template is not configured to accept credentials on launch.")}
        elif sub.unique_hash() in [cred.unique_hash() for cred in parent.credentials.all()]:
            return {
                "msg": _("This launch configuration already provides a {credential_type} credential.").format(credential_type=sub.unique_hash(display=True))
            }
        elif sub.pk in parent.unified_job_template.credentials.values_list('pk', flat=True):
            return {"msg": _("Related template already uses {credential_type} credential.").format(credential_type=sub.name)}

        # None means there were no validation errors
        return None


class AuthView(APIView):
    '''List enabled single-sign-on endpoints'''

    authentication_classes = []
    permission_classes = (AllowAny,)
    swagger_topic = 'System Configuration'

    def get(self, request):
        from rest_framework.reverse import reverse

        data = OrderedDict()
        err_backend, err_message = request.session.get('social_auth_error', (None, None))
        auth_backends = list(load_backends(settings.AUTHENTICATION_BACKENDS, force_load=True).items())
        # Return auth backends in consistent order: Google, GitHub, SAML.
        auth_backends.sort(key=lambda x: 'g' if x[0] == 'google-oauth2' else x[0])
        for name, backend in auth_backends:
            login_url = reverse('social:begin', args=(name,))
            complete_url = request.build_absolute_uri(reverse('social:complete', args=(name,)))
            backend_data = {'login_url': login_url, 'complete_url': complete_url}
            if name == 'saml':
                backend_data['metadata_url'] = reverse('sso:saml_metadata')
                for idp in sorted(settings.SOCIAL_AUTH_SAML_ENABLED_IDPS.keys()):
                    saml_backend_data = dict(backend_data.items())
                    saml_backend_data['login_url'] = '%s?idp=%s' % (login_url, idp)
                    label = settings.SOCIAL_AUTH_SAML_ENABLED_IDPS[idp].get('label')
                    if label:
                        saml_backend_data['label'] = label
                    full_backend_name = '%s:%s' % (name, idp)
                    if (err_backend == full_backend_name or err_backend == name) and err_message:
                        saml_backend_data['error'] = err_message
                    data[full_backend_name] = saml_backend_data
            else:
                if err_backend == name and err_message:
                    backend_data['error'] = err_message
                data[name] = backend_data
        return Response(data)


class ProjectNotificationTemplatesAnyList(SubListCreateAttachDetachAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer
    parent_model = models.Project


class HostRelatedSearchMixin(object):
    @property
    def related_search_fields(self):
        # Edge-case handle: https://github.com/ansible/ansible-tower/issues/7712
        ret = super(HostRelatedSearchMixin, self).related_search_fields
        ret.append('ansible_facts')
        return ret


class BadGateway(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = ''
    default_code = 'bad_gateway'


class GatewayTimeout(APIException):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = ''
    default_code = 'gateway_timeout'


class EnforceParentRelationshipMixin(object):
    """
    Useful when you have a self-referring ManyToManyRelationship.
    * Tower uses a shallow (2-deep only) url pattern. For example:

    When an object hangs off of a parent object you would have the url of the
    form /api/v2/parent_model/34/child_model. If you then wanted a child of the
    child model you would NOT do /api/v2/parent_model/34/child_model/87/child_child_model
    Instead, you would access the child_child_model via /api/v2/child_child_model/87/
    and you would create child_child_model's off of /api/v2/child_model/87/child_child_model_set
    Now, when creating child_child_model related to child_model you still want to
    link child_child_model to parent_model. That's what this class is for
    """

    enforce_parent_relationship = ''

    def update_raw_data(self, data):
        data.pop(self.enforce_parent_relationship, None)
        return super(EnforceParentRelationshipMixin, self).update_raw_data(data)

    def create(self, request, *args, **kwargs):
        # Inject parent group inventory ID into new group data.
        data = request.data
        # HACK: Make request data mutable.
        if getattr(data, '_mutable', None) is False:
            data._mutable = True
        data[self.enforce_parent_relationship] = getattr(self.get_parent_object(), '%s_id' % self.enforce_parent_relationship)
        return super(EnforceParentRelationshipMixin, self).create(request, *args, **kwargs)


class BaseVariableData(RetrieveUpdateAPIView):
    parser_classes = api_settings.DEFAULT_PARSER_CLASSES + [YAMLParser]
    renderer_classes = api_settings.DEFAULT_RENDERER_CLASSES + [YAMLRenderer]
    permission_classes = (VariableDataPermission,)


class InventorySourceNotificationTemplatesAnyList(SubListCreateAttachDetachAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer
    parent_model = models.InventorySource

    def post(self, request, *args, **kwargs):
        parent = self.get_parent_object()
        if parent.source not in models.CLOUD_INVENTORY_SOURCES:
            return Response(
                dict(msg=_("Notification Templates can only be assigned when source is one of {}.").format(models.CLOUD_INVENTORY_SOURCES, parent.source)),
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super(InventorySourceNotificationTemplatesAnyList, self).post(request, *args, **kwargs)


class JobTemplateNotificationTemplatesAnyList(SubListCreateAttachDetachAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer
    parent_model = models.JobTemplate


class SystemJobTemplateNotificationTemplatesAnyList(SubListCreateAttachDetachAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer
    parent_model = models.SystemJobTemplate


class BaseJobHostSummariesList(SubListAPIView):
    model = models.JobHostSummary
    serializer_class = serializers.JobHostSummarySerializer
    parent_model = None  # Subclasses must define this attribute.
    relationship = 'job_host_summaries'
    name = _('Job Host Summaries List')
    search_fields = ('host_name',)
    filter_read_permission = False


class BaseJobEventsList(NoTruncateMixin, SubListAPIView):
    model = models.JobEvent
    serializer_class = serializers.JobEventSerializer
    parent_model = None  # Subclasses must define this attribute.
    relationship = 'job_events'
    name = _('Job Events List')
    search_fields = ('stdout',)

    def finalize_response(self, request, response, *args, **kwargs):
        response['X-UI-Max-Events'] = settings.MAX_UI_JOB_EVENTS
        return super(BaseJobEventsList, self).finalize_response(request, response, *args, **kwargs)


class BaseAdHocCommandEventsList(NoTruncateMixin, SubListAPIView):
    model = models.AdHocCommandEvent
    serializer_class = serializers.AdHocCommandEventSerializer
    parent_model = None  # Subclasses must define this attribute.
    relationship = 'ad_hoc_command_events'
    name = _('Ad Hoc Command Events List')
    search_fields = ('stdout',)
    pagination_class = UnifiedJobEventPagination

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        return parent.get_event_queryset()


# class GroupJobEventsList(BaseJobEventsList):
#    parent_model = Group


# Pre-compile ANSI patterns for performance
_ANSI_COLOR_PATTERN = re.compile(r'\x1b\[(\d+(?:;\d+)*)m')
_ANSI_CURSOR_UP_PATTERN = re.compile(r'\x1b\[(\d*)A')

# ANSI color code to CSS color mapping
_ANSI_COLORS = {
    # Foreground colors (standard)
    '30': 'color: #000000',  # Black
    '31': 'color: #cd0000',  # Red
    '32': 'color: #00cd00',  # Green
    '33': 'color: #cdcd00',  # Yellow
    '34': 'color: #0000ee',  # Blue
    '35': 'color: #cd00cd',  # Magenta
    '36': 'color: #00cdcd',  # Cyan
    '37': 'color: #e5e5e5',  # White
    # Foreground colors (bright)
    '90': 'color: #7f7f7f',  # Bright Black (Gray)
    '91': 'color: #ff0000',  # Bright Red
    '92': 'color: #00ff00',  # Bright Green
    '93': 'color: #ffff00',  # Bright Yellow
    '94': 'color: #5c5cff',  # Bright Blue
    '95': 'color: #ff00ff',  # Bright Magenta
    '96': 'color: #00ffff',  # Bright Cyan
    '97': 'color: #ffffff',  # Bright White
    # Background colors (standard)
    '40': 'background-color: #000000',  # Black
    '41': 'background-color: #cd0000',  # Red
    '42': 'background-color: #00cd00',  # Green
    '43': 'background-color: #cdcd00',  # Yellow
    '44': 'background-color: #0000ee',  # Blue
    '45': 'background-color: #cd00cd',  # Magenta
    '46': 'background-color: #00cdcd',  # Cyan
    '47': 'background-color: #e5e5e5',  # White
    # Background colors (bright)
    '100': 'background-color: #7f7f7f',  # Bright Black (Gray)
    '101': 'background-color: #ff0000',  # Bright Red
    '102': 'background-color: #00ff00',  # Bright Green
    '103': 'background-color: #ffff00',  # Bright Yellow
    '104': 'background-color: #5c5cff',  # Bright Blue
    '105': 'background-color: #ff00ff',  # Bright Magenta
    '106': 'background-color: #00ffff',  # Bright Cyan
    '107': 'background-color: #ffffff',  # Bright White
    # Text formatting
    '1': 'font-weight: bold',  # Bold
    '4': 'text-decoration: underline',  # Underline
}


def ansi_to_html(text):
    """Convert ANSI color codes to HTML spans with CSS classes.

    Handles cursor-up commands (ESC[A) by removing the previous line,
    emulating terminal behavior for progress indicators.
    """
    # First, handle cursor-up commands like the original ansiconv
    # Split by ESC and process blocks
    blocks = text.split('\x1b')
    processed_blocks = []

    for i, block in enumerate(blocks):
        # Check if this block starts with a cursor-up command
        cursor_up_match = _ANSI_CURSOR_UP_PATTERN.match(block)
        if cursor_up_match:
            # Get the number of lines to move up (default to 1 if not specified)
            lines_up = int(cursor_up_match.group(1) or '1')

            # Remove the specified number of previous line(s) to emulate cursor movement
            for __ in range(lines_up):
                if not processed_blocks:
                    break
                # Remove blocks back to and including the previous newline
                while processed_blocks and '\n' not in processed_blocks[-1]:
                    processed_blocks.pop()
                    if not processed_blocks:
                        break
                # Now remove the block containing the newline
                if processed_blocks:
                    processed_blocks.pop()
            # Add the rest of the block after the command
            processed_blocks.append(block[cursor_up_match.end() :])
        else:
            # No cursor command, keep the block (prepend ESC if not first block)
            if i == 0:
                # First block - no ESC prefix needed
                processed_blocks.append(block)
            else:
                # Subsequent blocks - restore ESC prefix
                if block:
                    processed_blocks.append('\x1b' + block)

    # Rejoin the processed text
    text = ''.join(processed_blocks)

    # Now convert color codes to HTML with CSS classes
    result = []
    last_end = 0
    current_classes = set()  # Track active CSS classes
    has_open_span = False

    for match in _ANSI_COLOR_PATTERN.finditer(text):
        # Add text before this escape sequence
        result.append(text[last_end : match.start()])

        codes = match.group(1).split(';')

        # Process codes in order
        for code in codes:
            if code == '0' or code == '':
                # Reset all classes
                if has_open_span:
                    result.append('</span>')
                    has_open_span = False
                current_classes = set()
            elif code in _ANSI_COLORS:
                # Handle any supported ANSI code
                if code in ['1', '4']:  # Bold and underline
                    current_classes.add('ansi{}'.format(code))
                elif code.isdigit() and (30 <= int(code) <= 37 or 90 <= int(code) <= 97):  # Foreground colors (30-37, 90-97)
                    # Remove any existing foreground color class
                    current_classes = {cls for cls in current_classes if not re.match(r'^ansi(3[0-7]|9[0-7])$', cls)}
                    current_classes.add('ansi{}'.format(code))
                elif code.isdigit() and (40 <= int(code) <= 47 or 100 <= int(code) <= 107):  # Background colors (40-47, 100-107)
                    # Remove any existing background color class
                    current_classes = {cls for cls in current_classes if not re.match(r'^ansi(4[0-7]|10[0-7])$', cls)}
                    current_classes.add('ansi{}'.format(code))

        # After processing all codes, update the span
        if has_open_span:
            result.append('</span>')
            has_open_span = False

        if current_classes:
            class_str = ' '.join(sorted(current_classes))
            result.append('<span class="{}">'.format(class_str))
            has_open_span = True

        last_end = match.end()

    # Add remaining text
    result.append(text[last_end:])

    # Close any open span
    if has_open_span:
        result.append('</span>')

    return ''.join(result)


def redact_ansi(line):
    # Remove ANSI escape sequences used to embed event data.
    line = re.sub(r'\x1b\[K(?:[A-Za-z0-9+/=]+\x1b\[\d+D)+\x1b\[K', '', line)
    # Remove ANSI color escape sequences.
    return re.sub(r'\x1b[^m]*m', '', line)


class StdoutFilter(object):
    def __init__(self, fileobj):
        self._functions = []
        self.fileobj = fileobj
        self.extra_data = ''
        if hasattr(fileobj, 'close'):
            self.close = fileobj.close

    def read(self, size=-1):
        data = self.extra_data
        while size > 0 and len(data) < size:
            line = self.fileobj.readline(size)
            if not line:
                break
            line = self.process_line(line)
            data += line
        if size > 0 and len(data) > size:
            self.extra_data = data[size:]
            data = data[:size]
        else:
            self.extra_data = ''
        return data

    def register(self, func):
        self._functions.append(func)

    def process_line(self, line):
        for func in self._functions:
            line = func(line)
        return line


class UnifiedJobStdout(RetrieveAPIView):
    authentication_classes = api_settings.DEFAULT_AUTHENTICATION_CLASSES
    serializer_class = serializers.UnifiedJobStdoutSerializer
    renderer_classes = [
        renderers.BrowsableAPIRenderer,
        StaticHTMLRenderer,
        renderers.PlainTextRenderer,
        renderers.AnsiTextRenderer,
        JSONRenderer,
        renderers.DownloadTextRenderer,
        renderers.AnsiDownloadRenderer,
    ]
    filter_backends = ()

    def retrieve(self, request, *args, **kwargs):
        unified_job = self.get_object()
        try:
            target_format = request.accepted_renderer.format
            if target_format in ('html', 'api', 'json'):
                content_encoding = request.query_params.get('content_encoding', None)
                start_line = request.query_params.get('start_line', 0)
                end_line = request.query_params.get('end_line', None)
                dark_val = request.query_params.get('dark', '')
                dark = bool(dark_val and dark_val[0].lower() in ('1', 't', 'y'))
                content_only = bool(target_format in ('api', 'json'))
                dark_bg = (content_only and dark) or (not content_only and (dark or not dark_val))
                content, start, end, absolute_end = unified_job.result_stdout_raw_limited(start_line, end_line)

                # Remove any ANSI escape sequences containing job event data.
                content = re.sub(r'\x1b\[K(?:[A-Za-z0-9+/=]+\x1b\[\d+D)+\x1b\[K', '', content)

                body = ansi_to_html(html.escape(content))

                context = {'title': get_view_name(self.__class__), 'body': mark_safe(body), 'dark': dark_bg, 'content_only': content_only}
                data = render_to_string('api/stdout.html', context).strip()

                if target_format == 'api':
                    return Response(mark_safe(data))
                if target_format == 'json':
                    content = content.encode('utf-8')
                    if content_encoding == 'base64':
                        content = b64encode(content)
                    return Response({'range': {'start': start, 'end': end, 'absolute_end': absolute_end}, 'content': content})
                return Response(data)
            elif target_format == 'txt':
                return Response(unified_job.result_stdout)
            elif target_format == 'ansi':
                return Response(unified_job.result_stdout_raw)
            elif target_format in {'txt_download', 'ansi_download'}:
                filename = '{type}_{pk}{suffix}.txt'.format(
                    type=camelcase_to_underscore(unified_job.__class__.__name__), pk=unified_job.id, suffix='.ansi' if target_format == 'ansi_download' else ''
                )
                content_fd = unified_job.result_stdout_raw_handle(enforce_max_bytes=False)
                redactor = StdoutFilter(content_fd)
                if target_format == 'txt_download':
                    redactor.register(redact_ansi)
                if type(unified_job) == models.ProjectUpdate:
                    redactor.register(UriCleaner.remove_sensitive)
                # StreamingHttpResponse, not HttpResponse: the latter joins the whole
                # iterator into one bytes object on assignment, which undoes the temporary
                # file result_stdout_raw_handle() writes precisely to keep the download off
                # the heap. Streaming hands the worker back its 8 KiB block size.
                response = StreamingHttpResponse(FileWrapper(redactor), content_type='text/plain')
                response["Content-Disposition"] = 'attachment; filename="{}"'.format(filename)
                return response
            else:
                return super(UnifiedJobStdout, self).retrieve(request, *args, **kwargs)
        except models.StdoutMaxBytesExceeded as e:
            response_message = _(
                "Standard Output too large to display ({text_size} bytes), only download supported for sizes over {supported_size} bytes."
            ).format(text_size=e.total, supported_size=e.supported)
            if request.accepted_renderer.format == 'json':
                return Response({'range': {'start': 0, 'end': 1, 'absolute_end': 1}, 'content': response_message})
            else:
                return Response(response_message)


# Create view functions for all of the class-based views to simplify inclusion
# in URL patterns and reverse URL lookups, converting CamelCase names to
# lowercase_with_underscore (e.g. MyView.as_view() becomes my_view).
this_module = sys.modules[__name__]
for attr, value in list(locals().items()):
    if isinstance(value, type) and issubclass(value, APIView):
        name = camelcase_to_underscore(attr)
        view = value.as_view()
        setattr(this_module, name, view)
