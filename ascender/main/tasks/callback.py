import json
import time
import logging
from collections import deque

# Django
from ascender.settings.typed import settings
from django_guid import get_guid
from django.utils.functional import cached_property
from django.db import connections
from django.db.models import Exists, OuterRef

# Ascender
from ascender.main.constants import ENV_BLOCKLIST
from ascender.main.redact import UriCleaner
from ascender.main.constants import MINIMAL_EVENTS, ANSIBLE_RUNNER_NEEDS_UPDATE_MESSAGE
from ascender.main.utils.update_model import update_model
from ascender.main.queue import CallbackQueueDispatcher

logger = logging.getLogger('ascender.main.tasks.callback')


def persisted_event_counters(job):
    """
    What a resumed read of the job's output may skip: (threshold, counters_above, persisted_count).

    Events up to ``threshold`` are all saved, so a replayed event with a counter at or below
    it is skipped by one comparison. ``counters_above`` are the few saved events past that
    point: the callback receiver saves in parallel batches, so a later counter can land before
    an earlier one. ``persisted_count`` seeds the event count so emitted_events and the EOF
    counter describe the whole job rather than the replayed part. Memory is bounded by the
    receiver's concurrency, never by the size of the job.
    """
    qs = job.get_event_queryset()
    if not qs.filter(counter=1).exists():
        threshold = 0
    else:
        has_next = Exists(qs.filter(counter=OuterRef('counter') + 1))
        gap_event = qs.annotate(has_next=has_next).filter(has_next=False).order_by('counter').first()
        threshold = gap_event.counter if gap_event else 0
    above = qs.filter(counter__gt=threshold)
    persisted_above = above.count()
    cap = settings.JOB_EVENT_WORKERS * 1000
    if persisted_above > cap:
        logger.warning(
            f'{job.log_format}: {persisted_above} saved events sit past the contiguous prefix at {threshold}, more than the {cap} tracked; the rest are rejected by the database on replay'
        )
    counters_above = set(above.order_by('counter').values_list('counter', flat=True)[:cap])
    return threshold, counters_above, threshold + persisted_above


def _setting_as_bool(value, default):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', 'yes', 'on', '1'):
            return True
        if normalized in ('false', 'no', 'off', '0'):
            return False
    return default


def _setting_as_int(value, default):
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_stats_artifacts(stats_event_data, max_hosts):
    """Build the ascender_stats_* artifact entries from a playbook_on_stats event.

    The host name lists are omitted (and ascender_stats_hosts_truncated set) when the
    play involved more than max_hosts hosts, so artifacts stay reasonably small
    as they propagate to descendant workflow nodes.
    """
    counts = {}
    for stat in ('changed', 'failures', 'dark', 'ok', 'processed', 'skipped', 'ignored', 'rescued'):
        value = stats_event_data.get(stat)
        counts[stat] = value if isinstance(value, dict) else {}
    all_hosts = set()
    for host_counts in counts.values():
        all_hosts.update(host_counts.keys())
    changed_hosts = {host for host in all_hosts if counts['changed'].get(host)}
    failed_hosts = {host for host in all_hosts if counts['failures'].get(host) or counts['dark'].get(host)}
    stats_artifacts = {
        'ascender_stats_changed': bool(changed_hosts),
        'ascender_stats_failed': bool(failed_hosts),
        'ascender_stats_hosts_truncated': len(all_hosts) > max_hosts,
    }
    if not stats_artifacts['ascender_stats_hosts_truncated']:
        stats_artifacts.update(
            {
                'ascender_stats_changed_hosts': sorted(changed_hosts),
                'ascender_stats_non_changed_hosts': sorted(all_hosts - changed_hosts),
                'ascender_stats_failed_hosts': sorted(failed_hosts),
                'ascender_stats_non_failed_hosts': sorted(all_hosts - failed_hosts),
            }
        )
    return stats_artifacts


class RunnerCallback:
    def __init__(self, model=None):
        self.parent_workflow_job_id = None
        self.host_map = {}
        self.guid = get_guid()
        self.job_created = None
        self.recent_event_timings = deque(maxlen=settings.MAX_WEBSOCKET_EVENT_RATE)
        self.dispatcher = CallbackQueueDispatcher()
        self.safe_env = {}
        self.event_ct = 0
        self.model = model
        self.update_attempts = int(getattr(settings, 'DISPATCHER_DB_DOWNTOWN_TOLLERANCE', settings.DISPATCHER_DB_DOWNTIME_TOLERANCE) / 5)
        self.wrapup_event_dispatched = False
        self.wrapup_event_created = None  # the execution node's clock on the wrapup event
        self.artifacts_processed = False
        self.extra_update_fields = {}
        # ansible-runner reported 'starting': the execution environment has its payload
        self.worker_started = False
        # Set when reading a job's output is resumed on another node. Events with a counter at
        # or below the threshold, or in the set, are already saved and are not dispatched again.
        self.dedup_threshold = None
        self.persisted_counters = frozenset()
        # The private data dir of the resumed read; the post-run hooks find the artifacts there.
        self.private_data_dir_override = None

    def update_model(self, pk, _attempt=0, **updates):
        return update_model(self.model, pk, _attempt=0, _max_attempts=self.update_attempts, **updates)

    @cached_property
    def wrapup_event_type(self):
        return self.instance.event_class.WRAPUP_EVENT

    @cached_property
    def event_data_key(self):
        return self.instance.event_class.JOB_REFERENCE

    def configure_for_resume(self, instance, private_data_dir, reading=True):
        """
        Set up to read the rest of a job's output on this node, after the task that launched
        it is gone: stamp events the way the launch did, skip the ones already saved, and point
        the post-run hooks at this run's private data dir. Without ``reading`` the job is only
        finished here, and needs no host map; its event count is still the one it reports.
        """
        self.instance = instance
        self.job_created = str(instance.created)
        if getattr(instance, 'spawned_by_workflow', False):
            try:
                self.parent_workflow_job_id = instance.get_workflow_job().id
            except Exception:
                pass
        self.private_data_dir_override = private_data_dir
        self.dedup_threshold, self.persisted_counters, self.event_ct = persisted_event_counters(instance)
        if reading:
            self.populate_host_map_from_inventory(instance)
        job_env = dict(instance.job_env or {})
        if job_env and job_env.get('AWX_PRIVATE_DATA_DIR') != private_data_dir:
            job_env['AWX_PRIVATE_DATA_DIR'] = private_data_dir
            from ascender.main.signals import disable_activity_stream  # Circular import

            with disable_activity_stream():
                self.instance = self.update_model(instance.pk, job_env=job_env) or instance

    @staticmethod
    def inventory_script_params(instance):
        """The arguments the launch passes to Inventory.get_script_data for the inventory file."""
        script_params = dict(hostvars=True, ascendervars=True)
        if hasattr(instance, 'job_slice_number'):
            script_params['slice_number'] = instance.job_slice_number
            script_params['slice_count'] = instance.job_slice_count
            script_params['slice_pinned_hosts'] = instance.job_slice_pinned_hosts_list
        return script_params

    def populate_host_map_from_inventory(self, instance):
        """
        The launch of a playbook or an ad hoc command filled host_map while writing the
        inventory file (BaseTask.build_inventory; the other job types write none). A resumed read
        writes no inventory file, so it builds the map from the same script data, which keeps
        slicing, smart and constructed inventories mapped the way the launch mapped them.
        """
        if self.event_data_key not in ('job_id', 'ad_hoc_command_id') or not getattr(instance, 'inventory_id', None):
            return
        try:
            script_data = instance.inventory.get_script_data(**self.inventory_script_params(instance))
        except Exception:
            logger.warning(f'{instance.log_format}: could not build its host map; replayed events will carry no host id', exc_info=True)
            return
        for hostname, hv in script_data.get('_meta', {}).get('hostvars', {}).items():
            self.host_map[hostname] = hv.get('remote_tower_id', '')

    def _already_persisted(self, event_data):
        counter = event_data.get('counter')
        if self.dedup_threshold is None or counter is None:
            return False
        return counter <= self.dedup_threshold or counter in self.persisted_counters

    def _note_wrapup(self, event_data):
        if event_data.get('event', '') == self.wrapup_event_type:
            self.wrapup_event_dispatched = True
            self.wrapup_event_created = event_data.get('created')

    def _collect_artifacts(self, event_data):
        artifact_data = event_data.get('event_data', {}).get('artifact_data', {})
        if event_data.get('event', '') == 'playbook_on_stats' and self.event_data_key == 'job_id':
            stats_artifacts = self.get_stats_artifacts(event_data.get('event_data', {}))
            if stats_artifacts:
                # set_stats data provided by the playbook wins over the automatic keys
                stats_artifacts.update(artifact_data)
                artifact_data = stats_artifacts
        if artifact_data:
            self.delay_update(artifacts=artifact_data)

    def delay_update(self, skip_if_already_set=False, **kwargs):
        """Stash fields that should be saved along with the job status change"""
        for key, value in kwargs.items():
            if key in self.extra_update_fields and skip_if_already_set:
                continue
            elif key in self.extra_update_fields and key in ('job_explanation', 'result_traceback'):
                if str(value) in self.extra_update_fields.get(key, ''):
                    continue  # if already set, avoid duplicating messages
                # In the case of these fields, we do not want to lose any prior information, so combine values
                self.extra_update_fields[key] = '\n'.join([str(self.extra_update_fields[key]), str(value)])
            else:
                self.extra_update_fields[key] = value

    def get_delayed_update_fields(self):
        """Return finalized dict of all fields that should be saved along with the job status change"""
        self.extra_update_fields['emitted_events'] = self.event_ct
        if 'got an unexpected keyword argument' in self.extra_update_fields.get('result_traceback', ''):
            self.delay_update(result_traceback=ANSIBLE_RUNNER_NEEDS_UPDATE_MESSAGE)
        return self.extra_update_fields

    def event_handler(self, event_data):
        #
        # ⚠️  D-D-D-DANGER ZONE ⚠️
        # This method is called once for *every event* emitted by Ansible
        # Runner as a playbook runs.  That means that changes to the code in
        # this method are _very_ likely to introduce performance regressions.
        #
        # Even if this function is made on average .05s slower, it can have
        # devastating performance implications for playbooks that emit
        # tens or hundreds of thousands of events.
        #
        # Proceed with caution!
        #
        """
        Ansible runner puts a parent_uuid on each event, no matter what the type.
        AWX only saves the parent_uuid if the event is for a Job.
        """
        # cache end_line locally for RunInventoryUpdate tasks
        # which generate job events from two 'streams':
        # ansible-inventory and the ascender.main.commands.inventory_import
        # logger
        if event_data.get('event') == 'keepalive':
            return

        if self._already_persisted(event_data):
            # Replayed by a resumed read and already in the database. Nothing is dispatched, but
            # the job's artifacts and wrapup still have to be noted, since the launch that saw
            # this event first never got to finalize the job.
            self._note_wrapup(event_data)
            self._collect_artifacts(event_data)
            return False

        if event_data.get(self.event_data_key, None):
            if self.event_data_key != 'job_id':
                event_data.pop('parent_uuid', None)
        if self.parent_workflow_job_id:
            event_data['workflow_job_id'] = self.parent_workflow_job_id
        event_data['job_created'] = self.job_created

        host = event_data.get('event_data', {}).get('host', '').strip()
        if host:
            event_data['host_name'] = host
            if host in self.host_map:
                event_data['host_id'] = self.host_map[host]
        else:
            event_data['host_name'] = ''
            event_data['host_id'] = ''
        if event_data.get('event') == 'playbook_on_stats':
            event_data['host_map'] = self.host_map

        if isinstance(self, RunnerCallbackForProjectUpdate):
            # need a better way to have this check.
            # it's common for Ansible's SCM modules to print
            # error messages on failure that contain the plaintext
            # basic auth credentials (username + password)
            # it's also common for the nested event data itself (['res']['...'])
            # to contain unredacted text on failure
            # this is a _little_ expensive to filter
            # with regex, but project updates don't have many events,
            # so it *should* have a negligible performance impact
            task = event_data.get('event_data', {}).get('task_action')
            try:
                if task in ('git', 'svn', 'ansible.builtin.git', 'ansible.builtin.svn'):
                    event_data_json = json.dumps(event_data)
                    event_data_json = UriCleaner.remove_sensitive(event_data_json)
                    event_data = json.loads(event_data_json)
            except json.JSONDecodeError:
                pass

        if 'event_data' in event_data:
            event_data['event_data']['guid'] = self.guid

        # To prevent overwhelming the broadcast queue, skip some websocket messages
        if self.recent_event_timings:
            cpu_time = time.time()
            first_window_time = self.recent_event_timings[0]
            last_window_time = self.recent_event_timings[-1]

            if event_data.get('event') in MINIMAL_EVENTS:
                should_emit = True  # always send some types like playbook_on_stats
            elif event_data.get('stdout') == '' and event_data['start_line'] == event_data['end_line']:
                should_emit = False  # exclude events with no output
            else:
                should_emit = any(
                    [
                        # if 30the most recent websocket message was sent over 1 second ago
                        cpu_time - first_window_time > 1.0,
                        # if the very last websocket message came in over 1/30 seconds ago
                        self.recent_event_timings.maxlen * (cpu_time - last_window_time) > 1.0,
                        # if the queue is not yet full
                        len(self.recent_event_timings) != self.recent_event_timings.maxlen,
                    ]
                )

            if should_emit:
                self.recent_event_timings.append(cpu_time)
            else:
                event_data.setdefault('event_data', {})
                event_data['skip_websocket_message'] = True

        elif self.recent_event_timings.maxlen:
            self.recent_event_timings.append(time.time())

        self._note_wrapup(event_data)

        event_data.setdefault(self.event_data_key, self.instance.id)
        self.dispatcher.dispatch(event_data)
        self.event_ct += 1

        self._collect_artifacts(event_data)

        return False

    def get_stats_artifacts(self, stats_event_data):
        """Return the automatic ascender_stats_* artifacts for the final stats event,
        or an empty dict when the feature is disabled. This only runs once per
        job, so reading the job extra_vars here does not affect the hot path
        warned about in event_handler."""
        try:
            job_extra_vars = self.instance.extra_vars_dict
        except Exception:
            logger.exception(f'Failed to parse extra_vars of {self.instance.log_format}, using defaults for automatic stats artifacts')
            job_extra_vars = {}
        if not _setting_as_bool(job_extra_vars.get('ASCENDER_AUTO_STATS_ENABLED'), settings.ASCENDER_AUTO_STATS_ENABLED):
            return {}
        max_hosts = _setting_as_int(job_extra_vars.get('ASCENDER_AUTO_STATS_MAX_HOSTS'), settings.ASCENDER_AUTO_STATS_MAX_HOSTS)
        if max_hosts < 0:
            # the setting itself is validated with min_value=0, but the extra_vars
            # override is not; a negative value would flag every play as truncated
            max_hosts = settings.ASCENDER_AUTO_STATS_MAX_HOSTS
        return build_stats_artifacts(stats_event_data, max_hosts)

    def finished_callback(self, runner_obj):
        """
        Ansible runner callback triggered on finished run
        """
        event_data = {
            'event': 'EOF',
            'final_counter': self.event_ct,
            'guid': self.guid,
        }
        event_data.setdefault(self.event_data_key, self.instance.id)
        self.dispatcher.dispatch(event_data)
        if self.wrapup_event_type == 'EOF':
            self.wrapup_event_dispatched = True

    def status_handler(self, status_data, runner_config):
        """
        Ansible runner callback triggered on status transition
        """
        if status_data['status'] == 'starting':
            if self.private_data_dir_override:
                start_fields = self._resumed_start_fields(runner_config)
            else:
                job_env = dict(runner_config.env)
                '''
                Take the safe environment variables and overwrite
                '''
                for k, v in self.safe_env.items():
                    if k in job_env:
                        job_env[k] = v
                start_fields = dict(job_args=json.dumps(runner_config.command), job_cwd=runner_config.cwd, job_env=job_env)
            if start_fields:
                from ascender.main.signals import disable_activity_stream  # Circular import

                with disable_activity_stream():
                    self.instance = self.update_model(self.instance.pk, **start_fields)
            self.worker_started = True
            self.record_worker_started()
            # We opened a connection just for that save, close it here now
            connections.close_all()
        elif status_data['status'] == 'error':
            for field_name in ('result_traceback', 'job_explanation'):
                field_value = status_data.get(field_name, None)
                if field_value:
                    self.delay_update(**{field_name: field_value})

    def _resumed_start_fields(self, runner_config):
        """
        What a resumed read stores when it replays the worker's 'starting' status.

        The launch stored the job's environment with every value its credentials injected
        replaced by the masked value it injected alongside, and a resumed read has none of
        those. So the launch's record stands (configure_for_resume has pointed it at this run's
        private data dir), and only a job whose launch never got that far is given one here,
        with every value hidden that a credential could have set: credentials may set neither
        ANSIBLE_* variables nor those on ENV_BLOCKLIST (see CredentialTypeInjectorField), and
        build_safe_env masks those by name as it does for every job.
        """
        if self.instance.job_env:
            return {}
        from ascender.main.models.credential import HIDDEN_PASSWORD, build_safe_env  # Circular import

        job_env = build_safe_env(dict(runner_config.env))
        for key in job_env:
            if not key.startswith('ANSIBLE_') and key not in ENV_BLOCKLIST:
                job_env[key] = HIDDEN_PASSWORD
        job_env['AWX_PRIVATE_DATA_DIR'] = self.private_data_dir_override
        return dict(job_args=json.dumps(runner_config.command), job_cwd=runner_config.cwd, job_env=job_env)

    def record_worker_started(self):
        """
        Note on the job's monitor lease that its execution environment has its payload.
        Before this point a job that loses its monitor is re-queued; after it, resumed.
        """
        from ascender.main.models import JobMonitorLease  # Circular import

        try:
            JobMonitorLease.objects.record(self.instance, worker_started=True)
        except Exception:
            logger.warning(f'{self.instance.log_format}: could not record on its monitor lease that the worker started', exc_info=True)

    def artifacts_handler(self, artifact_dir):
        self.artifacts_processed = True


class RunnerCallbackForProjectUpdate(RunnerCallback):
    def __init__(self, *args, **kwargs):
        super(RunnerCallbackForProjectUpdate, self).__init__(*args, **kwargs)
        self.playbook_new_revision = None
        self.host_map = {}

    def event_handler(self, event_data):
        super_return_value = super(RunnerCallbackForProjectUpdate, self).event_handler(event_data)
        returned_data = event_data.get('event_data', {})
        if returned_data.get('task_action', '') in ('set_fact', 'ansible.builtin.set_fact'):
            returned_facts = returned_data.get('res', {}).get('ansible_facts', {})
            if 'scm_version' in returned_facts:
                self.playbook_new_revision = returned_facts['scm_version']
        return super_return_value


class RunnerCallbackForInventoryUpdate(RunnerCallback):
    def __init__(self, *args, **kwargs):
        super(RunnerCallbackForInventoryUpdate, self).__init__(*args, **kwargs)
        self.end_line = 0

    def event_handler(self, event_data):
        self.end_line = event_data['end_line']

        return super(RunnerCallbackForInventoryUpdate, self).event_handler(event_data)


class RunnerCallbackForAdHocCommand(RunnerCallback):
    def __init__(self, *args, **kwargs):
        super(RunnerCallbackForAdHocCommand, self).__init__(*args, **kwargs)
        self.host_map = {}


class RunnerCallbackForSystemJob(RunnerCallback):
    pass
