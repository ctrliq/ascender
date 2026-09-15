# Python
import pytest
from unittest import mock

# Ascender
from ascender.api.serializers import (
    InventorySourceSerializer,
)
from ascender.main.models import InventorySource


@pytest.fixture
def inventory_source(mocker):
    obj = mocker.MagicMock(
        pk=22, inventory=mocker.MagicMock(pk=23), update=mocker.MagicMock(), source_project_id=None, current_update=None, last_update=None, spec=InventorySource
    )
    return obj


@mock.patch('ascender.api.serializers.UnifiedJobTemplateSerializer.get_related', lambda x, y: {})
@mock.patch('ascender.api.serializers.InventorySourceOptionsSerializer.get_related', lambda x, y: {})
class TestInventorySourceSerializerGetRelated(object):
    @pytest.mark.parametrize(
        'related_resource_name',
        [
            'activity_stream',
            'notification_templates_error',
            'notification_templates_success',
            'notification_templates_started',
            'inventory_updates',
            'update',
            'hosts',
            'groups',
        ],
    )
    def test_get_related(self, test_get_related, inventory_source, related_resource_name):
        test_get_related(InventorySourceSerializer, inventory_source, 'inventory_sources', related_resource_name)
