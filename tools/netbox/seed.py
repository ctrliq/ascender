#!/usr/bin/env python3
"""Fill the development NetBox with an estate worth syncing.

Run by `make netbox-seed` against the NetBox `make netbox-start` brings up,
this gives the netbox inventory source something to read: two region trees, three sites, racks,
tenants, clusters, devices and virtual machines, config contexts that
overlap so the merge order is visible, out-of-band addresses on the
hardware, and three objects left offline so the disabled import can be
seen (the source enables a host when its status is active).

Standard library only, so it runs from the host with nothing installed.
Re-running it is safe: every object is matched on its natural key and left
alone if it already exists.

    tools/netbox/seed.py
    tools/netbox/seed.py --scale 2000
    tools/netbox/seed.py --url https://netbox.example --token ...
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = 'http://localhost:8000'
# Matches SUPERUSER_API_KEY and SUPERUSER_API_TOKEN in compose.yml beside this script.
# A development value, not a secret.
DEFAULT_TOKEN = 'nbt_abcdefghijkl.0123456789abcdef0123456789abcdef01234567'


class NetBoxError(RuntimeError):
    pass


class NetBox:
    def __init__(self, url: str, token: str, verbose: bool = False) -> None:
        self.url = url.rstrip('/')
        self.token = token
        self.verbose = verbose
        self.created = 0
        self.existing = 0

    def _request(self, method: str, path: str, body=None):
        url = f'{self.url}/api{path}'
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Authorization', f'Token {self.token}')
        req.add_header('Accept', 'application/json')
        if data:
            req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', 'replace')[:2000]
            raise NetBoxError(f'{method} {path} returned {exc.code}\n{detail}') from None
        except urllib.error.URLError as exc:
            raise NetBoxError(f'cannot reach {self.url}: {exc.reason}') from None

    def get(self, path: str, **params):
        if params:
            path = f'{path}?{urllib.parse.urlencode(params, doseq=True)}'
        return self._request('GET', path)

    def post(self, path: str, body):
        result = self._request('POST', path, body)
        self.created += len(body) if isinstance(body, list) else 1
        return result

    def patch(self, path: str, body):
        return self._request('PATCH', path, body)

    def find(self, endpoint: str, **lookup):
        page = self.get(endpoint, limit=1, **lookup)
        results = page.get('results') or []
        return results[0] if results else None

    def ensure(self, endpoint: str, lookup: dict, payload: dict) -> dict:
        """Return the object matching `lookup`, creating it from `payload` if absent."""
        found = self.find(endpoint, **lookup)
        if found:
            self.existing += 1
            if self.verbose:
                print(f'  = {endpoint} {lookup}')
            return found
        body = dict(payload)
        body.update(lookup)
        created = self.post(endpoint, body)
        if self.verbose:
            print(f'  + {endpoint} {lookup}')
        return created


def wait_for(nb: NetBox, attempts: int = 60) -> None:
    """NetBox runs migrations on first boot, so give it time to answer."""
    for attempt in range(attempts):
        try:
            status = nb.get('/status/')
        except NetBoxError:
            if attempt == attempts - 1:
                raise
            if attempt == 0:
                print(f'Waiting for NetBox at {nb.url} ...')
            time.sleep(5)
            continue
        version = status.get('netbox-version', 'unknown')
        print(f'NetBox {version} at {nb.url}')
        return
    raise NetBoxError('NetBox did not come up')


REGIONS = [
    ('amer', 'Americas', None),
    ('us-east', 'US East', 'amer'),
    ('emea', 'EMEA', None),
    ('uk', 'United Kingdom', 'emea'),
]

SITE_GROUPS = [('corporate', 'Corporate'), ('edge', 'Edge')]

SITES = [
    ('dc1', 'DC1', 'us-east', 'corporate', 'Hall 2', 'America/New_York'),
    ('dc2', 'DC2', 'uk', 'corporate', 'Suite 4', 'Europe/London'),
    ('branch1', 'Branch 1', 'us-east', 'edge', '', 'America/New_York'),
]

LOCATIONS = [('dc1-row-a', 'Row A', 'dc1'), ('dc2-row-a', 'Row A', 'dc2')]

RACKS = [('DC1-R01', 'dc1', 'dc1-row-a'), ('DC1-R02', 'dc1', 'dc1-row-a'), ('DC2-R01', 'dc2', 'dc2-row-a')]

TENANTS = [('acme', 'Acme Corp'), ('internal', 'Internal')]

MANUFACTURERS = [('dell', 'Dell'), ('cisco', 'Cisco'), ('arista', 'Arista'), ('fortinet', 'Fortinet')]

DEVICE_TYPES = [
    ('poweredge-r650', 'PowerEdge R650', 'dell', 1),
    ('poweredge-r760', 'PowerEdge R760', 'dell', 2),
    ('catalyst-c9300-48p', 'Catalyst C9300-48P', 'cisco', 1),
    ('dcs-7050sx3-48yc8', 'DCS-7050SX3-48YC8', 'arista', 1),
    ('fortigate-100f', 'FortiGate 100F', 'fortinet', 1),
]

DEVICE_ROLES = [
    ('database-server', 'Database Server', '2f6f6f'),
    ('web-server', 'Web Server', '4caf50'),
    ('core-switch', 'Core Switch', '2196f3'),
    ('access-switch', 'Access Switch', '03a9f4'),
    ('firewall', 'Firewall', 'f44336'),
    ('hypervisor', 'Hypervisor', '9c27b0'),
]

PLATFORMS = [
    ('rocky-linux-9', 'Rocky Linux 9'),
    ('ubuntu-2404', 'Ubuntu 24.04'),
    ('windows-server-2022', 'Windows Server 2022'),
    ('cisco-ios-xe', 'Cisco IOS-XE'),
    ('arista-eos', 'Arista EOS'),
    ('vmware-esxi-8', 'VMware ESXi 8'),
]

CLUSTER_TYPES = [('vmware-vsphere', 'VMware vSphere'), ('proxmox', 'Proxmox')]

CLUSTERS = [
    ('dc1-vmw-prod', 'vmware-vsphere', 'dc1'),
    ('dc2-pve-lab', 'proxmox', 'dc2'),
]

TAGS = [
    ('ansible-managed', 'Ansible Managed', '9e9e9e'),
    ('production', 'Production', '4caf50'),
    ('pci-scope', 'PCI Scope', 'ff9800'),
    ('patch-tuesday', 'Patch Tuesday', '673ab7'),
    ('decommissioning', 'Decommissioning', '795548'),
]

# name, type, label, choices
CUSTOM_FIELDS = [
    ('owner_team', 'text', 'Owner team', None),
    ('patch_window', 'text', 'Patch window', None),
    ('backup_policy', 'select', 'Backup policy', ['none', 'daily', 'weekly']),
]

# name, device_type, role, platform, site, rack, tenant, status, tags, mgmt ip, oob ip
DEVICES = [
    (
        'dc1-db-01',
        'poweredge-r650',
        'database-server',
        'rocky-linux-9',
        'dc1',
        'DC1-R01',
        'acme',
        'active',
        ['ansible-managed', 'production', 'pci-scope'],
        '10.1.10.11/24',
        '10.1.90.11/24',
    ),
    (
        'dc1-web-01',
        'poweredge-r650',
        'web-server',
        'ubuntu-2404',
        'dc1',
        'DC1-R01',
        'acme',
        'active',
        ['ansible-managed', 'production'],
        '10.1.10.12/24',
        '10.1.90.12/24',
    ),
    (
        'dc1-esx-01',
        'poweredge-r760',
        'hypervisor',
        'vmware-esxi-8',
        'dc1',
        'DC1-R02',
        'internal',
        'active',
        ['ansible-managed'],
        '10.1.10.21/24',
        '10.1.90.21/24',
    ),
    (
        'dc1-esx-02',
        'poweredge-r760',
        'hypervisor',
        'vmware-esxi-8',
        'dc1',
        'DC1-R02',
        'internal',
        'active',
        ['ansible-managed'],
        '10.1.10.22/24',
        '10.1.90.22/24',
    ),
    (
        'dc1-core-sw-01',
        'catalyst-c9300-48p',
        'core-switch',
        'cisco-ios-xe',
        'dc1',
        'DC1-R01',
        'internal',
        'active',
        ['ansible-managed', 'production'],
        '10.1.0.1/24',
        None,
    ),
    ('dc1-acc-sw-01', 'catalyst-c9300-48p', 'access-switch', 'cisco-ios-xe', 'dc1', 'DC1-R02', 'internal', 'active', ['ansible-managed'], '10.1.0.2/24', None),
    ('dc1-fw-01', 'fortigate-100f', 'firewall', None, 'dc1', 'DC1-R01', 'acme', 'active', ['pci-scope', 'production'], '10.1.0.254/24', None),
    ('dc1-old-sw-01', 'catalyst-c9300-48p', 'access-switch', 'cisco-ios-xe', 'dc1', 'DC1-R02', 'internal', 'offline', ['decommissioning'], '10.1.0.9/24', None),
    (
        'dc2-db-01',
        'poweredge-r650',
        'database-server',
        'rocky-linux-9',
        'dc2',
        'DC2-R01',
        'acme',
        'active',
        ['ansible-managed', 'production', 'pci-scope'],
        '10.2.10.11/24',
        '10.2.90.11/24',
    ),
    (
        'dc2-bkp-01',
        'poweredge-r760',
        'web-server',
        'ubuntu-2404',
        'dc2',
        'DC2-R01',
        'internal',
        'active',
        ['ansible-managed'],
        '10.2.10.31/24',
        '10.2.90.31/24',
    ),
    (
        'dc2-core-sw-01',
        'dcs-7050sx3-48yc8',
        'core-switch',
        'arista-eos',
        'dc2',
        'DC2-R01',
        'internal',
        'active',
        ['ansible-managed', 'production'],
        '10.2.0.1/24',
        None,
    ),
    ('branch1-sw-01', 'catalyst-c9300-48p', 'access-switch', 'cisco-ios-xe', 'branch1', None, 'acme', 'offline', ['decommissioning'], '10.3.0.1/24', None),
]

# name, cluster, site, role, platform, vcpus, memory, disk, status, tags, ip
VIRTUAL_MACHINES = [
    ('dc1-app-01', 'dc1-vmw-prod', 'dc1', 'web-server', 'rocky-linux-9', 4, 8192, 80, 'active', ['ansible-managed', 'production'], '10.1.20.11/24'),
    ('dc1-app-02', 'dc1-vmw-prod', 'dc1', 'web-server', 'rocky-linux-9', 4, 8192, 80, 'active', ['ansible-managed', 'production'], '10.1.20.12/24'),
    (
        'dc1-sql-01',
        'dc1-vmw-prod',
        'dc1',
        'database-server',
        'windows-server-2022',
        8,
        32768,
        500,
        'active',
        ['ansible-managed', 'production', 'pci-scope'],
        '10.1.20.21/24',
    ),
    ('dc1-dc-01', 'dc1-vmw-prod', 'dc1', 'web-server', 'windows-server-2022', 2, 4096, 60, 'active', ['ansible-managed'], '10.1.20.31/24'),
    ('dc1-mon-01', 'dc1-vmw-prod', 'dc1', 'web-server', 'ubuntu-2404', 2, 4096, 200, 'active', ['ansible-managed'], '10.1.20.41/24'),
    ('dc2-app-01', 'dc2-pve-lab', 'dc2', 'web-server', 'ubuntu-2404', 2, 4096, 40, 'active', ['ansible-managed'], '10.2.20.11/24'),
    ('dc2-app-02', 'dc2-pve-lab', 'dc2', 'web-server', 'rocky-linux-9', 2, 4096, 40, 'active', ['ansible-managed'], '10.2.20.12/24'),
    ('dc2-sql-01', 'dc2-pve-lab', 'dc2', 'database-server', 'rocky-linux-9', 4, 16384, 300, 'active', ['ansible-managed', 'pci-scope'], '10.2.20.21/24'),
    ('dc2-win-01', 'dc2-pve-lab', 'dc2', 'web-server', 'windows-server-2022', 2, 8192, 120, 'active', ['ansible-managed'], '10.2.20.31/24'),
    ('dc2-build-01', 'dc2-pve-lab', 'dc2', 'web-server', 'ubuntu-2404', 8, 16384, 400, 'active', ['ansible-managed'], '10.2.20.41/24'),
    ('dc2-lab-old', 'dc2-pve-lab', 'dc2', 'web-server', 'ubuntu-2404', 1, 2048, 20, 'offline', ['decommissioning'], '10.2.20.99/24'),
]

PREFIXES = ['10.1.0.0/16', '10.2.0.0/16', '10.3.0.0/16']


def seed_organisation(nb: NetBox) -> dict:
    print('Organisation')
    refs: dict = {'region': {}, 'site_group': {}, 'site': {}, 'location': {}, 'rack': {}, 'tenant': {}}

    for slug, name, parent in REGIONS:
        payload = {'name': name}
        if parent:
            payload['parent'] = refs['region'][parent]['id']
        refs['region'][slug] = nb.ensure('/dcim/regions/', {'slug': slug}, payload)

    for slug, name in SITE_GROUPS:
        refs['site_group'][slug] = nb.ensure('/dcim/site-groups/', {'slug': slug}, {'name': name})

    for slug, name, region, group, facility, tz in SITES:
        refs['site'][slug] = nb.ensure(
            '/dcim/sites/',
            {'slug': slug},
            {
                'name': name,
                'status': 'active',
                'region': refs['region'][region]['id'],
                'group': refs['site_group'][group]['id'],
                'facility': facility,
                'time_zone': tz,
            },
        )

    for slug, name, site in LOCATIONS:
        refs['location'][slug] = nb.ensure(
            '/dcim/locations/',
            {'slug': slug},
            {
                'name': name,
                'site': refs['site'][site]['id'],
                'status': 'active',
            },
        )

    for name, site, location in RACKS:
        refs['rack'][name] = nb.ensure(
            '/dcim/racks/',
            {'name': name},
            {
                'site': refs['site'][site]['id'],
                'location': refs['location'][location]['id'],
                'status': 'active',
                'u_height': 42,
            },
        )

    for slug, name in TENANTS:
        refs['tenant'][slug] = nb.ensure('/tenancy/tenants/', {'slug': slug}, {'name': name})

    return refs


def seed_catalogue(nb: NetBox) -> dict:
    print('Catalogue')
    refs: dict = {'manufacturer': {}, 'device_type': {}, 'role': {}, 'platform': {}, 'cluster_type': {}, 'cluster': {}, 'tag': {}}

    for slug, name in MANUFACTURERS:
        refs['manufacturer'][slug] = nb.ensure('/dcim/manufacturers/', {'slug': slug}, {'name': name})

    for slug, model, manufacturer, u_height in DEVICE_TYPES:
        refs['device_type'][slug] = nb.ensure(
            '/dcim/device-types/',
            {'slug': slug},
            {
                'model': model,
                'manufacturer': refs['manufacturer'][manufacturer]['id'],
                'u_height': u_height,
            },
        )

    for slug, name, colour in DEVICE_ROLES:
        refs['role'][slug] = nb.ensure('/dcim/device-roles/', {'slug': slug}, {'name': name, 'color': colour})

    for slug, name in PLATFORMS:
        refs['platform'][slug] = nb.ensure('/dcim/platforms/', {'slug': slug}, {'name': name})

    for slug, name in CLUSTER_TYPES:
        refs['cluster_type'][slug] = nb.ensure('/virtualization/cluster-types/', {'slug': slug}, {'name': name})

    for slug, name, colour in TAGS:
        refs['tag'][slug] = nb.ensure('/extras/tags/', {'slug': slug}, {'name': name, 'color': colour})

    return refs


def seed_clusters(nb: NetBox, org: dict, cat: dict) -> None:
    for name, cluster_type, site in CLUSTERS:
        # A cluster belongs to a site through its scope (NetBox 4.2 replaced
        # the site field with scope_type and scope_id).
        scope = {'scope_type': 'dcim.site', 'scope_id': org['site'][site]['id']}
        cluster = nb.ensure(
            '/virtualization/clusters/',
            {'name': name},
            {'type': cat['cluster_type'][cluster_type]['id'], 'status': 'active', **scope},
        )
        # Clusters an earlier version of this script made have no scope.
        if not cluster.get('scope_type'):
            cluster = nb.patch(f"/virtualization/clusters/{cluster['id']}/", scope)
        cat['cluster'][name] = cluster


def seed_custom_fields(nb: NetBox) -> None:
    print('Custom fields')
    object_types = ['dcim.device', 'virtualization.virtualmachine']
    for name, cf_type, label, choices in CUSTOM_FIELDS:
        payload = {'type': cf_type, 'label': label, 'object_types': object_types, 'required': False}
        if choices:
            choice_set = nb.ensure(
                '/extras/custom-field-choice-sets/',
                {'name': f'{name}-choices'},
                {
                    'extra_choices': [[choice, choice.title()] for choice in choices],
                },
            )
            payload['choice_set'] = choice_set['id']
        nb.ensure('/extras/custom-fields/', {'name': name}, payload)


def seed_config_contexts(nb: NetBox, org: dict, cat: dict) -> None:
    """Four contexts that overlap, so the merge order shows up in host vars.

    `cis_profile` is set by both the hardening context and the PCI one. The
    PCI context has the higher weight, so a device tagged pci-scope ends up
    on level2 and everything else on level1.
    """
    print('Config contexts')
    contexts = [
        (
            'Global baseline',
            1000,
            {},
            {
                'ansible_user': 'ansible',
                'ansible_connection': 'ssh',
                'dns_servers': ['10.1.0.5', '10.1.0.6'],
                'ntp_servers': ['10.1.0.1', '10.1.0.2'],
            },
        ),
        (
            'Linux hardening',
            1100,
            {
                'platforms': [cat['platform'][slug]['id'] for slug in ('rocky-linux-9', 'ubuntu-2404')],
            },
            {
                'package_manager': 'dnf',
                'selinux_state': 'enforcing',
                'audit_logging': True,
                'cis_profile': 'level1',
            },
        ),
        (
            'PCI scope',
            1200,
            {
                # Config contexts match tags by slug, not by id.
                'tags': ['pci-scope'],
            },
            {
                'cis_profile': 'level2',
                'password_max_age': 60,
                'pci_scan_window': 'sun 0100-0500',
            },
        ),
        (
            'Site DC1',
            1050,
            {
                'sites': [org['site']['dc1']['id']],
            },
            {
                'snmp_location': 'DC1',
                'syslog_target': 'syslog.dc1.example.net',
            },
        ),
    ]
    for name, weight, scope, data in contexts:
        payload = {'weight': weight, 'data': data, 'is_active': True}
        payload.update(scope)
        nb.ensure('/extras/config-contexts/', {'name': name}, payload)


def seed_prefixes(nb: NetBox) -> None:
    for prefix in PREFIXES:
        nb.ensure('/ipam/prefixes/', {'prefix': prefix}, {'status': 'active'})


def attach_address(nb: NetBox, address: str, parent_kind: str, parent_id: int, interface_name: str):
    """Create an interface on the parent and put `address` on it."""
    if parent_kind == 'device':
        iface = nb.ensure('/dcim/interfaces/', {'name': interface_name, 'device_id': parent_id}, {'device': parent_id, 'type': '1000base-t'})
        assigned_type = 'dcim.interface'
    else:
        iface = nb.ensure('/virtualization/interfaces/', {'name': interface_name, 'virtual_machine_id': parent_id}, {'virtual_machine': parent_id})
        assigned_type = 'virtualization.vminterface'
    return nb.ensure(
        '/ipam/ip-addresses/',
        {'address': address},
        {
            'status': 'active',
            'assigned_object_type': assigned_type,
            'assigned_object_id': iface['id'],
        },
    )


def seed_devices(nb: NetBox, org: dict, cat: dict) -> None:
    print(f'Devices ({len(DEVICES)})')
    for name, device_type, role, platform, site, rack, tenant, status, tags, mgmt_ip, oob_ip in DEVICES:
        payload = {
            'device_type': cat['device_type'][device_type]['id'],
            'role': cat['role'][role]['id'],
            'site': org['site'][site]['id'],
            'tenant': org['tenant'][tenant]['id'],
            'status': status,
            'tags': [{'slug': tag} for tag in tags],
            'custom_fields': {
                'owner_team': 'platform' if 'sw' in name or 'fw' in name else 'apps',
                'patch_window': 'sun 04:00',
                'backup_policy': 'daily' if 'db' in name or 'bkp' in name else 'weekly',
            },
        }
        if platform:
            payload['platform'] = cat['platform'][platform]['id']
        if rack:
            payload['rack'] = org['rack'][rack]['id']
        device = nb.ensure('/dcim/devices/', {'name': name}, payload)

        update = {}
        if mgmt_ip:
            address = attach_address(nb, mgmt_ip, 'device', device['id'], 'mgmt0')
            if not device.get('primary_ip4'):
                update['primary_ip4'] = address['id']
        if oob_ip:
            address = attach_address(nb, oob_ip, 'device', device['id'], 'oob0')
            if not device.get('oob_ip'):
                update['oob_ip'] = address['id']
        if update:
            nb.patch(f"/dcim/devices/{device['id']}/", update)

    # One device carries local context data, so the separation between what
    # an object sets itself and what it inherits is visible in the host vars.
    local = nb.find('/dcim/devices/', name='dc1-db-01')
    if local and not local.get('local_context_data'):
        nb.patch(
            f"/dcim/devices/{local['id']}/",
            {
                'local_context_data': {
                    'backup_window': '0200-0400',
                    'cis_profile': 'level2',
                }
            },
        )


def seed_virtual_machines(nb: NetBox, org: dict, cat: dict) -> None:
    print(f'Virtual machines ({len(VIRTUAL_MACHINES)})')
    for name, cluster, site, role, platform, vcpus, memory, disk, status, tags, ip in VIRTUAL_MACHINES:
        vm = nb.ensure(
            '/virtualization/virtual-machines/',
            {'name': name},
            {
                'cluster': cat['cluster'][cluster]['id'],
                'site': org['site'][site]['id'],
                'role': cat['role'][role]['id'],
                'platform': cat['platform'][platform]['id'],
                'vcpus': vcpus,
                'memory': memory,
                'disk': disk,
                'status': status,
                'tags': [{'slug': tag} for tag in tags],
                'custom_fields': {
                    'owner_team': 'apps',
                    'patch_window': 'sun 02:00',
                    'backup_policy': 'daily' if 'sql' in name else 'weekly',
                },
            },
        )
        if ip:
            address = attach_address(nb, ip, 'vm', vm['id'], 'eth0')
            if not vm.get('primary_ip4'):
                nb.patch(f"/virtualization/virtual-machines/{vm['id']}/", {'primary_ip4': address['id']})


def seed_scale(nb: NetBox, org: dict, cat: dict, count: int, batch: int = 200) -> None:
    """Add `count` plain devices, to measure a sync against a large estate.

    These get a role, type, site and tags so config context still has to be
    rendered for each one, but no rack, interface or address: the point is
    the per-object cost on the NetBox side, not the realism of the cabling.
    """
    print(f'Scale devices ({count})')
    # The names already there, so a device deleted since the last run is
    # made again and none is made twice.
    existing = set()
    offset = 0
    while True:
        page = nb.get('/dcim/devices/', brief=1, name__isw='scale-', limit=1000, offset=offset)
        existing.update(device['name'] for device in page['results'])
        offset += len(page['results'])
        if not page.get('next') or not page['results']:
            break
    missing = [index for index in range(count) if f'scale-{index:06d}' not in existing]
    if not missing:
        print(f'  = {count} already present')
        return

    site = org['site']['dc1']['id']
    tenant = org['tenant']['acme']['id']
    types = [cat['device_type'][slug]['id'] for slug, *_ in DEVICE_TYPES]
    roles = [cat['role'][slug]['id'] for slug, *_ in DEVICE_ROLES]
    platforms = [cat['platform'][slug]['id'] for slug, *_ in PLATFORMS]
    tags = [cat['tag']['ansible-managed']['id']]
    pci = cat['tag']['pci-scope']['id']

    started = time.monotonic()
    pending = []
    for done, index in enumerate(missing, 1):
        pending.append(
            {
                'name': f'scale-{index:06d}',
                'device_type': types[index % len(types)],
                'role': roles[index % len(roles)],
                'platform': platforms[index % len(platforms)],
                'site': site,
                'tenant': tenant,
                'status': 'active',
                'tags': tags + ([pci] if index % 7 == 0 else []),
            }
        )
        if len(pending) >= batch:
            nb.post('/dcim/devices/', pending)
            print(f'  + {done}/{len(missing)}')
            pending = []
    if pending:
        nb.post('/dcim/devices/', pending)
    print(f'  done in {time.monotonic() - started:.1f}s')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', default=DEFAULT_URL, help=f'NetBox base URL (default {DEFAULT_URL})')
    parser.add_argument('--token', default=DEFAULT_TOKEN, help='NetBox API token')
    parser.add_argument('--scale', type=int, default=0, metavar='N', help='also create N plain devices, for timing a sync against a large estate')
    parser.add_argument('--verbose', action='store_true', help='print every object')
    args = parser.parse_args()

    nb = NetBox(args.url, args.token, verbose=args.verbose)
    try:
        wait_for(nb)
        org = seed_organisation(nb)
        cat = seed_catalogue(nb)
        seed_clusters(nb, org, cat)
        seed_custom_fields(nb)
        seed_config_contexts(nb, org, cat)
        seed_prefixes(nb)
        seed_devices(nb, org, cat)
        seed_virtual_machines(nb, org, cat)
        if args.scale:
            seed_scale(nb, org, cat, args.scale)
    except NetBoxError as exc:
        print(f'\n{exc}', file=sys.stderr)
        return 1

    devices = nb.get('/dcim/devices/', limit=1)['count']
    vms = nb.get('/virtualization/virtual-machines/', limit=1)['count']
    print(f'\n{nb.created} created, {nb.existing} already there.')
    print(f'{devices} devices and {vms} virtual machines in NetBox.')
    print('\nFor the netbox inventory source, make a NetBox credential with the URL the task')
    print('container reaches NetBox at (http://netbox:8080 for the development NetBox) and')
    print(f'the API token {args.token}, then sync.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
