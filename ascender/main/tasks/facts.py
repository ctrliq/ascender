import datetime
import os
import json
import logging

# Django
from ascender.settings.typed import settings
from django.db import transaction
from django.utils.encoding import smart_str
from django.utils.timezone import now

# Ascender
from ascender.main.utils.common import log_excess_runtime
from ascender.main.utils.db import bulk_update_sorted_by_id
from ascender.main.models import Host

logger = logging.getLogger('ascender.main.tasks.facts')
system_tracking_logger = logging.getLogger('ascender.analytics.system_tracking')

# ansible-core 2.19+ wraps every persistent cache plugin so that a host's facts
# are stored under a schema-qualified key ("s1_<host>") as {"__payload__": "<json>"},
# where the JSON carries data tags (Origin, TrustedAsTemplate, ...) inline. Older
# ansible-core reads and writes plain "<host>" files. We can't know ahead of time
# which ansible-core the execution environment has, so both files are written and
# whichever one ansible touched is read back.
SCHEMA_KEY_PREFIX = 's1_'
PAYLOAD_KEY = '__payload__'
ANSIBLE_TYPE_KEY = '__ansible_type'
LEGACY_VAULT_KEY = '__ansible_vault'


def _strip_ansible_types(value):
    """Turn ansible-core's tagged JSON representation back into plain fact data."""
    if isinstance(value, list):
        return [_strip_ansible_types(v) for v in value]
    if not isinstance(value, dict):
        return value
    type_name = value.get(ANSIBLE_TYPE_KEY)
    if type_name is None:
        return {k: _strip_ansible_types(v) for k, v in value.items()}
    if type_name == 'EncryptedString':
        # keep the representation older ansible-core used for vaulted values
        return {LEGACY_VAULT_KEY: value.get('value')}
    if 'value' in value:  # _AnsibleTagged{Str,Int,Float,List,Dict,Set,Tuple,...}
        return _strip_ansible_types(value['value'])
    if 'iso8601' in value:  # AnsibleSerializable{Date,Time,DateTime}
        return value['iso8601']
    return {k: _strip_ansible_types(v) for k, v in value.items() if k != ANSIBLE_TYPE_KEY}


def _add_ansible_types(value):
    """Convert legacy vault markers so ansible-core 2.19+ decodes them as vaulted strings."""
    if isinstance(value, list):
        return [_add_ansible_types(v) for v in value]
    if not isinstance(value, dict):
        return value
    if len(value) == 1 and isinstance(value.get(LEGACY_VAULT_KEY), str):
        return {'value': value[LEGACY_VAULT_KEY], 'tags': [], ANSIBLE_TYPE_KEY: 'EncryptedString'}
    return {k: _add_ansible_types(v) for k, v in value.items()}


def _is_payload_wrapper(data):
    return isinstance(data, dict) and list(data) == [PAYLOAD_KEY] and isinstance(data[PAYLOAD_KEY], str)


def _read_facts(filepath, schema_qualified):
    """Return the facts stored in filepath, or None if the file isn't in the expected format."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if _is_payload_wrapper(data) != schema_qualified:
            return None
        if schema_qualified:
            data = _strip_ansible_types(json.loads(data[PAYLOAD_KEY]))
    except (ValueError, OSError):
        return None
    return data if isinstance(data, dict) else None


def _write_facts(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        os.chmod(f.name, 0o600)
        json.dump(data, f)
    # Backdate the file by 2 seconds so finish_fact_cache can reliably
    # distinguish these reference files from files updated by ansible.
    # This guarantees fact file mtime < summary file mtime even with
    # zipfile's 2-second timestamp rounding during artifact transfer.
    backdated = os.path.getmtime(filepath) - 2
    os.utime(filepath, (backdated, backdated))
    return backdated


@log_excess_runtime(logger, debug_cutoff=0.01, msg='Inventory {inventory_id} host facts prepared for {written_ct} hosts, took {delta:.3f} s', add_log_data=True)
def start_fact_cache(hosts, artifacts_dir, timeout=None, inventory_id=None, log_data=None):
    log_data = log_data or {}
    log_data['inventory_id'] = inventory_id
    log_data['written_ct'] = 0
    # Dict mapping host name -> bool (True if a fact file was written)
    hosts_cached = {}

    # Create the fact_cache directory inside artifacts_dir
    fact_cache_dir = os.path.join(artifacts_dir, 'fact_cache')
    os.makedirs(fact_cache_dir, mode=0o700, exist_ok=True)

    if timeout is None:
        timeout = settings.ANSIBLE_FACT_CACHE_TIMEOUT

    # A file named "s1_<name>" is the older ansible-core cache file of host "s1_<name>"
    # and the newer ansible-core cache file of host "<name>". Nobody owns it until
    # ansible runs, so it is never written for either host.
    all_names = {host.name for host in hosts}
    ambiguous = {name for name in all_names if name.startswith(SCHEMA_KEY_PREFIX) and name[len(SCHEMA_KEY_PREFIX) :] in all_names}
    if ambiguous:
        logger.warning(
            f'Inventory {inventory_id}: no cached facts are provided for host names that collide with the ansible-core 2.19+ cache format: {sorted(ambiguous)}'
        )

    last_write_time = None
    written_files = []
    for host in hosts:
        hosts_cached[host.name] = False
        if not host.ansible_facts_modified or (timeout and host.ansible_facts_modified < now() - datetime.timedelta(seconds=timeout)):
            continue  # facts are expired - do not write them

        filepath = os.path.join(fact_cache_dir, host.name)
        if not os.path.realpath(filepath).startswith(fact_cache_dir):
            logger.error(f'facts for host {smart_str(host.name)} could not be cached')
            continue

        schema_file = SCHEMA_KEY_PREFIX + host.name
        for filename, data in (
            (host.name, host.ansible_facts),
            (schema_file, {PAYLOAD_KEY: json.dumps(_add_ansible_types(host.ansible_facts))}),
        ):
            if filename in ambiguous:
                continue
            try:
                last_write_time = _write_facts(os.path.join(fact_cache_dir, filename), data)
            except IOError:
                logger.error(f'facts for host {smart_str(host.name)} could not be cached')
                continue
            written_files.append(filename)
            hosts_cached[host.name] = True
        if hosts_cached[host.name]:
            log_data['written_ct'] += 1

    # Write summary file directly to the artifacts_dir
    if inventory_id is not None:
        summary_file = os.path.join(artifacts_dir, 'host_cache_summary.json')
        summary_data = {
            'last_write_time': last_write_time,
            'hosts_cached': hosts_cached,
            'written_files': written_files,
        }
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary_data, f, indent=2)


@log_excess_runtime(
    logger,
    debug_cutoff=0.01,
    msg='Inventory {inventory_id} host facts: updated {updated_ct}, cleared {cleared_ct}, unchanged {unmodified_ct}, took {delta:.3f} s',
    add_log_data=True,
)
def finish_fact_cache(host_qs, artifacts_dir, job_id=None, inventory_id=None, job_created=None, log_data=None):
    log_data = log_data or {}
    log_data['inventory_id'] = inventory_id
    log_data['updated_ct'] = 0
    log_data['unmodified_ct'] = 0
    log_data['cleared_ct'] = 0
    # The summary file is directly inside the artifacts dir
    summary_path = os.path.join(artifacts_dir, 'host_cache_summary.json')
    if not os.path.exists(summary_path):
        logger.error(f'Missing summary file at {summary_path}')
        return

    try:
        with open(summary_path, 'r', encoding='utf-8') as f:
            summary = json.load(f)
        facts_write_time = os.path.getmtime(summary_path)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f'Error reading summary file at {summary_path}: {e}')
        return

    hosts_cached_map = summary.get('hosts_cached', {})
    fact_cache_dir = os.path.join(artifacts_dir, 'fact_cache')

    # Phase 1: Scan files on disk to discover which hosts have updated or missing facts
    present = set()  # fact files on disk
    updated = set()  # fact files modified by Ansible
    if os.path.isdir(fact_cache_dir):
        for filename in os.listdir(fact_cache_dir):
            filepath = os.path.join(fact_cache_dir, filename)
            if os.path.islink(filepath):
                logger.error(f'Invalid path for facts file: {filepath}')
                continue
            if not os.path.isfile(filepath):
                continue
            try:
                modified = os.path.getmtime(filepath)
            except OSError as e:
                logger.warning(f'Could not stat facts file {filepath}: {e}')
                continue
            present.add(filename)
            if modified >= facts_write_time:
                updated.add(filename)

    # Attribute each updated file to the host whose facts it holds. Older ansible-core
    # writes "<host>" with plain JSON, newer writes "s1_<host>" with a payload wrapper,
    # and a name that fits both hosts is settled by its content.
    hosts_with_updates = {}  # hostname -> [(filename, schema_qualified)], newest format first
    for filename in updated:
        owners = []
        if filename.startswith(SCHEMA_KEY_PREFIX) and filename[len(SCHEMA_KEY_PREFIX) :] in hosts_cached_map:
            owners.append((filename[len(SCHEMA_KEY_PREFIX) :], True))
        if filename in hosts_cached_map:
            owners.append((filename, False))
        if len(owners) > 1:
            is_wrapper = _read_facts(os.path.join(fact_cache_dir, filename), schema_qualified=True) is not None
            owners = [owner for owner in owners if owner[1] == is_wrapper]
        for hostname, schema_qualified in owners:
            hosts_with_updates.setdefault(hostname, []).append((filename, schema_qualified))
    for candidates in hosts_with_updates.values():
        candidates.sort(key=lambda candidate: not candidate[1])

    # Summaries from before written_files existed only had the plain file
    written_files = set(summary.get('written_files', [hostname for hostname, was_written in hosts_cached_map.items() if was_written]))
    hosts_to_clear = []  # hostnames where Ansible removed a fact file written for them
    for hostname in hosts_cached_map:
        if hostname in hosts_with_updates:
            continue
        if any(filename in written_files and filename not in present for filename in (hostname, SCHEMA_KEY_PREFIX + hostname)):
            hosts_to_clear.append(hostname)
        else:
            log_data['unmodified_ct'] += 1

    # Phase 2: Stream updated facts to database in batches
    if hosts_with_updates:
        hosts_to_save = []
        total_rows_updated = 0
        for host in host_qs.filter(name__in=list(hosts_with_updates)).select_related('inventory').iterator():
            for filename, schema_qualified in hosts_with_updates[host.name]:
                new_facts = _read_facts(os.path.join(fact_cache_dir, filename), schema_qualified=schema_qualified)
                if new_facts is not None:
                    break
            else:
                log_data['unmodified_ct'] += 1
                continue

            if new_facts != host.ansible_facts:
                host.ansible_facts = new_facts
                host.ansible_facts_modified = now()
                hosts_to_save.append(host)
                logger.info(
                    f'New fact for inventory {smart_str(host.inventory.name)} host {smart_str(host.name)}',
                    extra=dict(
                        inventory_id=host.inventory.id,
                        host_name=host.name,
                        ansible_facts=host.ansible_facts,
                        ansible_facts_modified=host.ansible_facts_modified.isoformat(),
                        job_id=job_id,
                    ),
                )
                log_data['updated_ct'] += 1
            else:
                log_data['unmodified_ct'] += 1

            if len(hosts_to_save) >= 100:
                total_rows_updated += bulk_update_sorted_by_id(Host, hosts_to_save, fields=['ansible_facts', 'ansible_facts_modified'])
                hosts_to_save = []

        if hosts_to_save:
            total_rows_updated += bulk_update_sorted_by_id(Host, hosts_to_save, fields=['ansible_facts', 'ansible_facts_modified'])

        # Mismatch means a concurrent process changed or deleted hosts between our read and bulk update
        if total_rows_updated != log_data['updated_ct']:
            logger.warning(
                f'Fact update for inventory {inventory_id} job {job_id}: expected to update {log_data["updated_ct"]} hosts but {total_rows_updated} rows were changed'
            )

    # Phase 3: Clear facts for hosts whose files were removed by Ansible.
    # The rows stay locked (in id order, like bulk_update_sorted_by_id) from the
    # concurrent-update check until the clear is saved, so facts a concurrent job
    # saves in between can't be wiped.
    if hosts_to_clear:
        with transaction.atomic():
            hosts = list(host_qs.filter(name__in=hosts_to_clear).select_related('inventory').select_for_update(of=('self',)).order_by('id'))
            clear_hosts = []
            for host in hosts:
                if job_created and host.ansible_facts_modified and host.ansible_facts_modified > job_created:
                    logger.warning(
                        f'Skipping fact clear for host {smart_str(host.name)} in job {job_id} '
                        f'inventory {inventory_id}: host ansible_facts_modified '
                        f'({host.ansible_facts_modified.isoformat()}) is after this job\'s '
                        f'created time ({job_created.isoformat()}). '
                        f'A concurrent job likely updated this host\'s facts while this job was running.'
                    )
                    log_data['unmodified_ct'] += 1
                else:
                    host.ansible_facts = {}
                    host.ansible_facts_modified = now()
                    clear_hosts.append(host)
                    logger.info(f'Facts cleared for inventory {smart_str(host.inventory.name)} host {smart_str(host.name)}')
                    log_data['cleared_ct'] += 1

            if clear_hosts:
                rows = bulk_update_sorted_by_id(Host, clear_hosts, fields=['ansible_facts', 'ansible_facts_modified'])
                if rows != len(clear_hosts):
                    logger.warning(
                        f'Fact clear for inventory {inventory_id} job {job_id}: expected to clear {len(clear_hosts)} hosts but {rows} rows were changed'
                    )

    logger.debug(f'Updated {log_data["updated_ct"]} host facts for inventory {inventory_id} in job {job_id}')
