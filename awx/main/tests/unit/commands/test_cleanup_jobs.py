import logging
from datetime import timedelta
from unittest import mock

from django.utils.timezone import now

from awx.main.management.commands.cleanup_jobs import DeleteMeta, _pre_delete_job_host_summaries, JHS_CHUNK_SIZE
from awx.main.models import Job


class TestPreDeleteJobHostSummaries:
    def test_empty_list_is_noop(self):
        with mock.patch('awx.main.management.commands.cleanup_jobs.connection') as mock_conn:
            _pre_delete_job_host_summaries([])
            mock_conn.cursor.assert_not_called()

    def test_single_chunk(self):
        job_pks = [1, 2, 3]
        with mock.patch('awx.main.management.commands.cleanup_jobs.connection') as mock_conn:
            mock_cursor = mock.MagicMock()
            mock_conn.cursor.return_value.__enter__ = mock.Mock(return_value=mock_cursor)
            mock_conn.cursor.return_value.__exit__ = mock.Mock(return_value=False)

            _pre_delete_job_host_summaries(job_pks)

            assert mock_cursor.execute.call_count == 1
            delete_call = mock_cursor.execute.call_args_list[0]
            assert 'DELETE FROM main_jobhostsummary' in delete_call[0][0]
            assert 'ANY(%s)' in delete_call[0][0]
            assert delete_call[0][1] == [[1, 2, 3]]

    def test_multiple_chunks(self):
        job_pks = list(range(1, JHS_CHUNK_SIZE + 500))
        with mock.patch('awx.main.management.commands.cleanup_jobs.connection') as mock_conn:
            mock_cursor = mock.MagicMock()
            mock_conn.cursor.return_value.__enter__ = mock.Mock(return_value=mock_cursor)
            mock_conn.cursor.return_value.__exit__ = mock.Mock(return_value=False)

            _pre_delete_job_host_summaries(job_pks)

            # 2 chunks x 1 DELETE each = 2 execute calls
            assert mock_cursor.execute.call_count == 2

            # First chunk should have JHS_CHUNK_SIZE items
            first_delete = mock_cursor.execute.call_args_list[0]
            assert len(first_delete[0][1][0]) == JHS_CHUNK_SIZE

            # Second chunk should have the remainder
            second_delete = mock_cursor.execute.call_args_list[1]
            assert len(second_delete[0][1][0]) == 499

    def test_sql_is_fully_static(self):
        """SQL strings contain no interpolated values — only ANY(%s) placeholders."""
        job_pks = [100, 200]
        with mock.patch('awx.main.management.commands.cleanup_jobs.connection') as mock_conn:
            mock_cursor = mock.MagicMock()
            mock_conn.cursor.return_value.__enter__ = mock.Mock(return_value=mock_cursor)
            mock_conn.cursor.return_value.__exit__ = mock.Mock(return_value=False)

            _pre_delete_job_host_summaries(job_pks)

            for call in mock_cursor.execute.call_args_list:
                sql = call[0][0]
                assert 'ANY(%s)' in sql
                assert '100' not in sql
                assert '200' not in sql

    def test_logger_called_per_chunk(self):
        job_pks = [1, 2, 3]
        logger = mock.MagicMock()
        with mock.patch('awx.main.management.commands.cleanup_jobs.connection') as mock_conn:
            mock_cursor = mock.MagicMock()
            mock_conn.cursor.return_value.__enter__ = mock.Mock(return_value=mock_cursor)
            mock_conn.cursor.return_value.__exit__ = mock.Mock(return_value=False)

            _pre_delete_job_host_summaries(job_pks, logger=logger)

            logger.debug.assert_called_once()

class TestDeleteMetaPreDelete:
    """Verify DeleteMeta.delete_jobs() calls _pre_delete_job_host_summaries correctly."""

    @mock.patch('awx.main.management.commands.cleanup_jobs._pre_delete_job_host_summaries')
    def test_called_for_job_class(self, mock_pre_delete):
        from awx.main.management.commands.cleanup_jobs import DeleteMeta
        from awx.main.models import Job

        dm = DeleteMeta(logger=mock.MagicMock(), job_class=Job, cutoff=mock.MagicMock(), dry_run=False)
        dm.jobs_pk_list = [10, 20, 30]

        with mock.patch.object(Job.objects, 'filter') as mock_filter:
            mock_filter.return_value.delete.return_value = (3, {})
            dm.delete_jobs()

        mock_pre_delete.assert_called_once_with([10, 20, 30], dm.logger)

    @mock.patch('awx.main.management.commands.cleanup_jobs._pre_delete_job_host_summaries')
    def test_skipped_for_non_job_class(self, mock_pre_delete):
        from awx.main.management.commands.cleanup_jobs import DeleteMeta
        from awx.main.models import ProjectUpdate

        dm = DeleteMeta(logger=mock.MagicMock(), job_class=ProjectUpdate, cutoff=mock.MagicMock(), dry_run=False)
        dm.jobs_pk_list = [10, 20]

        with mock.patch.object(ProjectUpdate.objects, 'filter') as mock_filter:
            mock_filter.return_value.delete.return_value = (2, {})
            dm.delete_jobs()

        mock_pre_delete.assert_not_called()

    @mock.patch('awx.main.management.commands.cleanup_jobs._pre_delete_job_host_summaries')
    def test_skipped_for_dry_run(self, mock_pre_delete):
        from awx.main.management.commands.cleanup_jobs import DeleteMeta
        from awx.main.models import Job

        dm = DeleteMeta(logger=mock.MagicMock(), job_class=Job, cutoff=mock.MagicMock(), dry_run=True)
        dm.jobs_pk_list = [10, 20]

        dm.delete_jobs()

        mock_pre_delete.assert_not_called()


class TestFindPartitionsToDrop:
    """The partition list comes back as table names that have to be read as dates."""

    def _delete_meta(self, children):
        delete_meta = DeleteMeta(logging.getLogger('awx.main.commands.cleanup_jobs'), Job, now() - timedelta(days=1), dry_run=False)
        cursor = mock.MagicMock()
        cursor.fetchall.return_value = [(name,) for name in children]
        connection = mock.MagicMock()
        connection.cursor.return_value.__enter__ = mock.Mock(return_value=cursor)
        connection.cursor.return_value.__exit__ = mock.Mock(return_value=False)
        return delete_meta, connection

    def test_partitions_are_collected(self):
        delete_meta, connection = self._delete_meta(['main_jobevent_20210318_09', 'main_jobevent_20210318_11'])

        with mock.patch('awx.main.management.commands.cleanup_jobs.connection', connection):
            delete_meta.find_partitions_to_drop()

        assert delete_meta.parts_to_drop == {'main_jobevent_20210318_09', 'main_jobevent_20210318_11'}

    def test_a_name_without_a_date_is_skipped(self):
        """partition_name_dt returns None for those, and dropping a None makes
        the whole cleanup run fail on dt_to_partition_name."""
        delete_meta, connection = self._delete_meta(['main_jobevent_20210318_09', 'main_jobevent_default'])

        with mock.patch('awx.main.management.commands.cleanup_jobs.connection', connection):
            delete_meta.find_partitions_to_drop()

        assert delete_meta.parts_to_drop == {'main_jobevent_20210318_09'}
