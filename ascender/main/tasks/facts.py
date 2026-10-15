import datetime
import os
import json
import logging

# Django
from ascender.settings.typed import settings
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

    last_write_time = None
    to_write = []
    for host in hosts:
        if not host.ansible_facts_modified or (timeout and host.ansible_facts_modified < now() - datetime.timedelta(seconds=timeout)):
            hosts_cached[host.name] = False
            continue  # facts are expired - do not write them

        filepath = os.path.join(fact_cache_dir, host.name)
        if not os.path.realpath(filepath).startswith(fact_cache_dir):
            logger.error(f'facts for host {smart_str(host.name)} could not be cached')
            hosts_cached[host.name] = False
            continue
        hosts_cached[host.name] = True
        to_write.append((host.name, host.ansible_facts))

    for name, facts in to_write:
        try:
            last_write_time = _write_facts(os.path.join(fact_cache_dir, name), facts)
            log_data['written_ct'] += 1
        except IOError:
            logger.error(f'facts for host {smart_str(name)} could not be cached')
            hosts_cached[name] = False
            continue
        # A host literally named "s1_<name>" owns that file for older ansible-core
        if SCHEMA_KEY_PREFIX + name in hosts_cached:
            continue
        try:
            _write_facts(os.path.join(fact_cache_dir, SCHEMA_KEY_PREFIX + name), {PAYLOAD_KEY: json.dumps(_add_ansible_types(facts))})
        except IOError:
            logger.error(f'facts for host {smart_str(name)} could not be cached')

    # Write summary file directly to the artifacts_dir
    if inventory_id is not None:
        summary_file = os.path.join(artifacts_dir, 'host_cache_summary.json')
        summary_data = {
            'last_write_time': last_write_time,
            'hosts_cached': hosts_cached,
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

    # hostname -> candidate file names, newest ansible-core format first
    hosts_with_updates = {}
    hosts_to_clear = []  # hostnames where Ansible removed the fact file
    for hostname, was_written in hosts_cached_map.items():
        schema_file = SCHEMA_KEY_PREFIX + hostname
        candidates = [f for f in (schema_file, hostname) if f in updated]
        if candidates:
            hosts_with_updates[hostname] = candidates
        elif was_written and (hostname not in present or (schema_file not in hosts_cached_map and schema_file not in present)):
            hosts_to_clear.append(hostname)
        else:
            log_data['unmodified_ct'] += 1

    # Phase 2: Stream updated facts to database in batches
    if hosts_with_updates:
        hosts_to_save = []
        total_rows_updated = 0
        for host in host_qs.filter(name__in=list(hosts_with_updates)).select_related('inventory').iterator():
            for filename in hosts_with_updates[host.name]:
                new_facts = _read_facts(os.path.join(fact_cache_dir, filename), schema_qualified=filename != host.name)
                if new_facts is not None:
                    break
            else:
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

    # Phase 3: Clear facts for hosts whose files were removed by Ansible
    if hosts_to_clear:
        hosts = list(host_qs.filter(name__in=hosts_to_clear).select_related('inventory'))
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
                logger.warning(f'Fact clear for inventory {inventory_id} job {job_id}: expected to clear {len(clear_hosts)} hosts but {rows} rows were changed')

    logger.debug(f'Updated {log_data["updated_ct"]} host facts for inventory {inventory_id} in job {job_id}')
