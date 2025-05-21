import codecs
import datetime
import os
import json
import logging

# Django
from django.conf import settings
from django.utils.encoding import smart_str
from django.utils.timezone import now

# AWX
from awx.main.utils.common import log_excess_runtime
from awx.main.models.inventory import Host
from awx.main.utils.db import bulk_update_sorted_by_id
from awx.main.models import Host

logger = logging.getLogger('awx.main.tasks.facts')
system_tracking_logger = logging.getLogger('awx.analytics.system_tracking')


@log_excess_runtime(logger, debug_cutoff=0.01, msg='Inventory {inventory_id} host facts prepared for {written_ct} hosts, took {delta:.3f} s', add_log_data=True)
def start_fact_cache(hosts, destination, log_data, timeout=None, inventory_id=None):
    log_data['inventory_id'] = inventory_id
    log_data['written_ct'] = 0
    hosts_cached = list()
    try:
        os.makedirs(destination, mode=0o700)
    except FileExistsError:
        pass

    if timeout is None:
        timeout = settings.ANSIBLE_FACT_CACHE_TIMEOUT

    last_filepath_written = None
    for host in hosts:
        hosts_cached.append(host)
        if not host.ansible_facts_modified or (timeout and host.ansible_facts_modified < now() - datetime.timedelta(seconds=timeout)):
            continue  # facts are expired - do not write them
        filepath = os.sep.join(map(str, [destination, host.name]))
        if not os.path.realpath(filepath).startswith(destination):
            system_tracking_logger.error('facts for host {} could not be cached'.format(smart_str(host.name)))
            continue

        try:
            with codecs.open(filepath, 'w', encoding='utf-8') as f:
                os.chmod(f.name, 0o600)
                json.dump(host.ansible_facts, f)
                log_data['written_ct'] += 1
                last_filepath_written = filepath
        except IOError:
            system_tracking_logger.error('facts for host {} could not be cached'.format(smart_str(host.name)))
            continue

    if last_filepath_written:
        return os.path.getmtime(last_filepath_written), hosts_cached

    return None, hosts_cached


@log_excess_runtime(
    logger,
    debug_cutoff=0.01,
    msg='Inventory {inventory_id} host facts: updated {updated_ct}, cleared {cleared_ct}, unchanged {unmodified_ct}, took {delta:.3f} s',
    add_log_data=True,
)
def finish_fact_cache(hosts_cached, destination, facts_write_time, log_data, job_id=None, inventory_id=None):
    log_data['inventory_id'] = inventory_id
    log_data['updated_ct'] = 0
    log_data['unmodified_ct'] = 0
    log_data['cleared_ct'] = 0

    hosts_cached = sorted((h for h in hosts_cached if h.id is not None), key=lambda h: h.id)

    hosts_to_update = []
    for host in hosts_cached:
        filepath = os.sep.join(map(str, [destination, host.name]))
        if not os.path.realpath(filepath).startswith(destination):
            system_tracking_logger.error('facts for host {} could not be cached'.format(smart_str(host.name)))
            continue
        if os.path.exists(filepath):
            # If the file changed since we wrote the last facts file, pre-playbook run...
            modified = os.path.getmtime(filepath)
            if (not facts_write_time) or modified > facts_write_time:
                with codecs.open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        ansible_facts = json.load(f)
                    except ValueError:
                        continue
                    host.ansible_facts = ansible_facts
                    host.ansible_facts_modified = now()
                    hosts_to_update.append(host)
                    system_tracking_logger.info(
                        'New fact for inventory {} host {}'.format(smart_str(host.inventory.name), smart_str(host.name)),
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
        else:
            # if the file goes missing, ansible removed it (likely via clear_facts)
            # if the file goes missing, but the host has not started facts, then we should not clear the facts
            host.ansible_facts = {}
            host.ansible_facts_modified = now()
            hosts_to_update.append(host)
            system_tracking_logger.info('Facts cleared for inventory {} host {}'.format(smart_str(host.inventory.name), smart_str(host.name)))
            log_data['cleared_ct'] += 1
        if len(hosts_to_update) > 100:
            bulk_update_sorted_by_id(Host, hosts_to_update, fields=['ansible_facts', 'ansible_facts_modified'])
            hosts_to_update = []
    bulk_update_sorted_by_id(Host, hosts_to_update, fields=['ansible_facts', 'ansible_facts_modified'])
