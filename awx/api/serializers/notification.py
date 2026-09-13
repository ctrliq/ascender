# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Notification templates, and the notifications sent from them.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import json
from collections import OrderedDict
from jinja2 import sandbox, StrictUndefined
from jinja2.exceptions import TemplateSyntaxError, UndefinedError, SecurityError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from awx.main.models import JobNotificationMixin, Notification, NotificationTemplate
from awx.api.serializers.base import (
    BaseSerializer,
)


class NotificationTemplateSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete', 'copy']
    capabilities_prefetch = [{'copy': 'organization.admin'}]

    class Meta:
        model = NotificationTemplate
        fields = ('*', 'organization', 'notification_type', 'notification_configuration', 'messages')
        extra_kwargs = {
            # required/default must be explicit since DRF 3.16: nullable FKs now
            # infer required=False with default=None, which would change this
            # endpoint's contract (OPTIONS metadata and the missing-field error code)
            'organization': {'required': True, 'default': serializers.empty},
        }

    type_map = {"string": (str,), "int": (int,), "bool": (bool,), "list": (list,), "password": (str,), "object": (dict, OrderedDict)}

    def to_representation(self, obj):
        ret = super(NotificationTemplateSerializer, self).to_representation(obj)
        if 'notification_configuration' in ret:
            ret['notification_configuration'] = obj.display_notification_configuration()
        return ret

    def get_related(self, obj):
        res = super(NotificationTemplateSerializer, self).get_related(obj)
        res.update(
            dict(
                test=self.reverse('api:notification_template_test', kwargs={'pk': obj.pk}),
                notifications=self.reverse('api:notification_template_notification_list', kwargs={'pk': obj.pk}),
                copy=self.reverse('api:notification_template_copy', kwargs={'pk': obj.pk}),
            )
        )
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        return res

    def _recent_notifications(self, obj):
        return [{'id': x.id, 'status': x.status, 'created': x.created, 'error': x.error} for x in obj.notifications.all().order_by('-created')[:5]]

    def get_summary_fields(self, obj):
        d = super(NotificationTemplateSerializer, self).get_summary_fields(obj)
        d['recent_notifications'] = self._recent_notifications(obj)
        return d

    def validate_messages(self, messages):
        if messages is None:
            return None

        error_list = []
        collected_messages = []

        def check_messages(messages):
            for message_type in messages:
                if message_type not in ('message', 'body'):
                    error_list.append(_("Message type '{}' invalid, must be either 'message' or 'body'").format(message_type))
                    continue
                message = messages[message_type]
                if message is None:
                    continue
                if not isinstance(message, str):
                    error_list.append(_("Expected string for '{}', found {}, ").format(message_type, type(message)))
                    continue
                if message_type == 'message':
                    if '\n' in message:
                        error_list.append(_("Messages cannot contain newlines (found newline in {} event)".format(event)))
                        continue
                collected_messages.append(message)

        # Validate structure / content types
        if not isinstance(messages, dict):
            error_list.append(_("Expected dict for 'messages' field, found {}".format(type(messages))))
        else:
            for event in messages:
                if event not in ('started', 'success', 'error', 'changed', 'workflow_approval'):
                    error_list.append(_("Event '{}' invalid, must be one of 'started', 'success', 'error', 'changed', or 'workflow_approval'").format(event))
                    continue
                event_messages = messages[event]
                if event_messages is None:
                    continue
                if not isinstance(event_messages, dict):
                    error_list.append(_("Expected dict for event '{}', found {}").format(event, type(event_messages)))
                    continue
                if event == 'workflow_approval':
                    for subevent in event_messages:
                        if subevent not in ('running', 'approved', 'timed_out', 'denied'):
                            error_list.append(
                                _("Workflow Approval event '{}' invalid, must be one of 'running', 'approved', 'timed_out', or 'denied'").format(subevent)
                            )
                            continue
                        subevent_messages = event_messages[subevent]
                        if subevent_messages is None:
                            continue
                        if not isinstance(subevent_messages, dict):
                            error_list.append(_("Expected dict for workflow approval event '{}', found {}").format(subevent, type(subevent_messages)))
                            continue
                        check_messages(subevent_messages)
                else:
                    check_messages(event_messages)

        # Subclass to return name of undefined field
        class DescriptiveUndefined(StrictUndefined):
            # The parent class prevents _accessing attributes_ of an object
            # but will render undefined objects with 'Undefined'. This
            # prevents their use entirely.
            __repr__ = __str__ = StrictUndefined._fail_with_undefined_error

            def __init__(self, *args, **kwargs):
                super(DescriptiveUndefined, self).__init__(*args, **kwargs)
                # When an undefined field is encountered, return the name
                # of the undefined field in the exception message
                # (StrictUndefined refers to the explicitly set exception
                # message as the 'hint')
                self._undefined_hint = self._undefined_name

        # Ensure messages can be rendered
        for msg in collected_messages:
            env = sandbox.ImmutableSandboxedEnvironment(undefined=DescriptiveUndefined)
            try:
                env.from_string(msg).render(JobNotificationMixin.context_stub())
            except TemplateSyntaxError as exc:
                error_list.append(_("Unable to render message '{}': {}".format(msg, exc.message)))
            except UndefinedError as exc:
                error_list.append(_("Field '{}' unavailable".format(exc.message)))
            except SecurityError as exc:
                error_list.append(_("Security error due to field '{}'".format(exc.message)))

        # Ensure that if a webhook body was provided, that it can be rendered as a dictionary
        notification_type = ''
        if self.instance:
            notification_type = getattr(self.instance, 'notification_type', '')
        else:
            notification_type = self.initial_data.get('notification_type', '')

        if notification_type == 'webhook':
            for event in messages:
                if not messages[event]:
                    continue
                if not isinstance(messages[event], dict):
                    continue
                body = messages[event].get('body', {})
                if body:
                    try:
                        sandbox.ImmutableSandboxedEnvironment(undefined=DescriptiveUndefined).from_string(body).render(JobNotificationMixin.context_stub())

                        # https://github.com/ansible/awx/issues/14410

                        # When rendering something such as "{{ job.id }}"
                        # the return type is not a dict, unlike "{{ job_metadata }}" which is a dict

                        # potential_body = json.loads(rendered_body)

                        # if not isinstance(potential_body, dict):
                        #     error_list.append(
                        #         _("Webhook body for '{}' should be a json dictionary. Found type '{}'.".format(event, type(potential_body).__name__))
                        #     )
                    except Exception as exc:
                        error_list.append(_("Webhook body for '{}' is not valid. The following gave an error ({}).".format(event, exc)))

        if error_list:
            raise serializers.ValidationError(error_list)

        return messages

    def validate(self, attrs):
        from awx.api.views.notification import (
            NotificationTemplateDetail,
        )

        notification_type = None
        if 'notification_type' in attrs:
            notification_type = attrs['notification_type']
        elif self.instance:
            notification_type = self.instance.notification_type
        else:
            notification_type = None
        if not notification_type:
            raise serializers.ValidationError(_('Missing required fields for Notification Configuration: notification_type'))

        notification_class = NotificationTemplate.CLASS_FOR_NOTIFICATION_TYPE[notification_type]
        missing_fields = []
        incorrect_type_fields = []
        password_fields_to_forward = []
        error_list = []
        if 'notification_configuration' not in attrs:
            return attrs
        if self.context['view'].kwargs and isinstance(self.context['view'], NotificationTemplateDetail):
            object_actual = self.context['view'].get_object()
        else:
            object_actual = None
        for field, params in notification_class.init_parameters.items():
            if field not in attrs['notification_configuration']:
                if 'default' in params:
                    attrs['notification_configuration'][field] = params['default']
                else:
                    missing_fields.append(field)
                    continue
            field_val = attrs['notification_configuration'][field]
            field_type = params['type']
            expected_types = self.type_map[field_type]
            if type(field_val) not in expected_types:
                incorrect_type_fields.append((field, field_type))
                continue
            if field_type == "list" and len(field_val) < 1:
                error_list.append(_("No values specified for field '{}'").format(field))
                continue
            if field_type == "password" and field_val == "$encrypted$" and object_actual is not None:
                password_fields_to_forward.append(field)
            if field == "http_method" and field_val.lower() not in ['put', 'post']:
                error_list.append(_("HTTP method must be either 'POST' or 'PUT'."))
        if missing_fields:
            error_list.append(_("Missing required fields for Notification Configuration: {}.").format(missing_fields))
        if incorrect_type_fields:
            for type_field_error in incorrect_type_fields:
                error_list.append(_("Configuration field '{}' incorrect type, expected {}.").format(type_field_error[0], type_field_error[1]))
        if error_list:
            raise serializers.ValidationError(error_list)

        # Only pull the existing encrypted passwords from the existing objects
        # to assign to the attribute and forward on the call stack IF AND ONLY IF
        # we know an error will not be raised in the validation phase.
        # Otherwise, the encrypted password will be exposed.
        for field in password_fields_to_forward:
            attrs['notification_configuration'][field] = object_actual.notification_configuration[field]
        return super(NotificationTemplateSerializer, self).validate(attrs)


class NotificationSerializer(BaseSerializer):
    body = serializers.SerializerMethodField(help_text=_('Notification body'))

    class Meta:
        model = Notification
        fields = (
            '*',
            '-name',
            '-description',
            'notification_template',
            'error',
            'status',
            'notifications_sent',
            'notification_type',
            'recipients',
            'subject',
            'body',
        )

    def get_body(self, obj):
        if obj.notification_type in ('webhook', 'pagerduty'):
            if isinstance(obj.body, dict):
                if 'body' in obj.body:
                    return obj.body['body']
            elif isinstance(obj.body, str):
                # attempt to load json string
                try:
                    potential_body = json.loads(obj.body)
                    if isinstance(potential_body, dict):
                        return potential_body
                except json.JSONDecodeError:
                    pass
        return obj.body

    def get_related(self, obj):
        res = super(NotificationSerializer, self).get_related(obj)
        res.update(dict(notification_template=self.reverse('api:notification_template_detail', kwargs={'pk': obj.notification_template.pk})))
        return res

    def to_representation(self, obj):
        ret = super(NotificationSerializer, self).to_representation(obj)

        if obj.notification_type == 'webhook':
            ret.pop('subject')
        if obj.notification_type not in ('email', 'webhook', 'pagerduty'):
            ret.pop('body')
        return ret
