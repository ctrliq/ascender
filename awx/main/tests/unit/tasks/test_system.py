import pytest
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from awx.main.tasks.system import awx_periodic_scheduler, update_inventory_computed_fields
from awx.main.models import Inventory
from django.db import DatabaseError


@pytest.fixture
def mock_logger():
    with patch("awx.main.tasks.system.logger") as logger:
        yield logger


@pytest.fixture
def mock_inventory():
    return MagicMock(spec=Inventory)


def test_update_inventory_computed_fields_existing_inventory(mock_logger, mock_inventory):
    # Mocking the Inventory.objects.filter method to return a non-empty queryset
    with patch("awx.main.tasks.system.Inventory.objects.filter") as mock_filter:
        mock_filter.return_value.exists.return_value = True
        mock_filter.return_value.__getitem__.return_value = mock_inventory

        # Mocking the update_computed_fields method
        with patch.object(mock_inventory, "update_computed_fields") as mock_update_computed_fields:
            update_inventory_computed_fields(1)

            # Assertions
            mock_filter.assert_called_once_with(id=1)
            mock_update_computed_fields.assert_called_once()

            # You can add more assertions based on your specific requirements


def test_update_inventory_computed_fields_missing_inventory(mock_logger):
    # Mocking the Inventory.objects.filter method to return an empty queryset
    with patch("awx.main.tasks.system.Inventory.objects.filter") as mock_filter:
        mock_filter.return_value.exists.return_value = False

        update_inventory_computed_fields(1)

        # Assertions
        mock_filter.assert_called_once_with(id=1)
        mock_logger.error.assert_called_once_with("Update Inventory Computed Fields failed due to missing inventory: 1")


def test_update_inventory_computed_fields_database_error_nosqlstate(mock_logger, mock_inventory):
    # Mocking the Inventory.objects.filter method to return a non-empty queryset
    with patch("awx.main.tasks.system.Inventory.objects.filter") as mock_filter:
        mock_filter.return_value.exists.return_value = True
        mock_filter.return_value.__getitem__.return_value = mock_inventory

        # Mocking the update_computed_fields method
        with patch.object(mock_inventory, "update_computed_fields") as mock_update_computed_fields:
            # Simulating the update_computed_fields method to explicitly raise a DatabaseError
            mock_update_computed_fields.side_effect = DatabaseError("Some error")

            update_inventory_computed_fields(1)

            # Assertions
            mock_filter.assert_called_once_with(id=1)
            mock_update_computed_fields.assert_called_once()
            mock_inventory.update_computed_fields.assert_called_once()


def test_awx_periodic_scheduler_skips_schedule_processing_when_all_schedules_disabled():
    run_now = datetime(2026, 5, 7, tzinfo=timezone.utc)
    state = MagicMock()
    state.schedule_last_run = datetime(2026, 5, 6, tzinfo=timezone.utc)

    @contextmanager
    def mock_advisory_lock(*args, **kwargs):
        yield True

    with patch("awx.main.tasks.system.advisory_lock", mock_advisory_lock):
        with patch("awx.main.tasks.system.TowerScheduleState.get_solo", return_value=state):
            with patch("awx.main.tasks.system.now", return_value=run_now):
                with patch("awx.main.tasks.system.Schedule.objects.enabled") as mock_enabled:
                    with patch("awx.main.tasks.system.settings.DISABLE_ALL_SCHEDULES", True):
                        awx_periodic_scheduler()

    assert state.schedule_last_run == run_now
    state.save.assert_called_once_with()
    mock_enabled.assert_not_called()
