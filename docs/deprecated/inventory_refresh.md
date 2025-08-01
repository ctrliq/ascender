# Inventory Refresh Overview
Ascender should have an inventory view that is more aligned towards systems management
rather than merely maintaining inventory for automation.

## Inventory Source Promotion
Starting with Tower 3.2, `InventorySource` will be associated directly with an `Inventory`.


## Fact Searching
Facts generated by an Ansible playbook during a Job Template run are stored by Ascender into the database
whenever `use_fact_cache=True` is set per-Job-Template. New facts are merged with existing
facts and are per-host. These stored facts can be used to filter hosts via the
`/api/v2/hosts` endpoint, using the GET query parameter `host_filter` *i.e.*,
`/api/v2/hosts?host_filter=ansible_facts__ansible_processor_vcpus=8`

The grammar of `host_filter` allows for:
* grouping via `()`
* the boolean `and` operator
* `__` to reference related fields in relational fields
* `__` is used on `ansible_facts` to separate keys in a JSON key path
* `[]` is used to denote a JSON array in the path specification
* `""` can be used in the value when spaces are utilized
* "classic" Django queries may be embedded in the `host_filter`

Examples:
```
/api/v2/hosts/?host_filter=name=localhost
/api/v2/hosts/?host_filter=ansible_facts__ansible_date_time__weekday_number="3"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor[]="GenuineIntel"
/api/v2/hosts/?host_filter=ansible_facts__ansible_lo__ipv6[]__scope="host"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor_vcpus=8
/api/v2/hosts/?host_filter=ansible_facts__ansible_env__PYTHONUNBUFFERED="true"
/api/v2/hosts/?host_filter=(name=localhost or name=database) and (groups__name=east or groups__name="west coast") and ansible_facts__ansible_processor_vcpus=8
```

## Smart Inventory
Starting in Tower 3.2, Tower will support the ability to define a _Smart Inventory_.
Users will define the inventories using the same language that is currently supported
in _Smart Search_.

### Inventory Changes
* The `Inventory` model has a new field called `kind`. The default of this field will be blank
for normal inventories and set to `smart` for smart inventories.

* `Inventory` model has a new field called `host_filter`. The default of this field will be blank
for normal inventories. When `host_filter` is set AND the inventory `kind` is set to `smart`, this combination makes a _Smart Inventory_.

* `Host` model has a new field called `smart_inventories`. This field uses the `SmartInventoryMemberships`
lookup table to provide a set of all of the _Smart Inventory_ a host is a part of. The memberships
are generated by the `update_host_smart_inventory_memberships` task. The task is launched when:
    * New Host is added.
    * Existing Host is changed (update/delete).
    * New Smart Inventory is added.
    * Existing Smart Inventory is changed (update/delete).
    * **NOTE:** This task is only run if the `AWX_REBUILD_SMART_MEMBERSHIP` is set to `True`. It defaults to `False`.

### Smart Filter (`host_filter`)
The `SmartFilter` class handles our translation of the smart search string. We store the
filter value in the `host_filter` field for an inventory. This value should be expressed
the same way for existing smart searches.

    host_filter="search=foo"
    host_filter="group__search=bar"
    host_filter="search=baz and group__search=bang"
    host_filter="name=localhost or group__name=local"

Creating a new _Smart Inventory_ for all of our GCE and EC2 groups might look like this:

    HTTP POST /api/v2/inventories/

    {
        "name": "GCE and EC2 Smart Inventory",
        "kind": "smart",
        "host_filter": "group__search=ec2 and group__search=gce"
        ...
    }

### More On Searching
The `host_filter` that is set will search over the entirety of the hosts the user has
access to in Ascender. If the user wants to restrict their search in anyway, they will
want to declare that in their host filter.

For example, if wanting to restrict the search to only hosts in an inventory
named "US-East", create a `host_filter` that looks something like this:

    {
        "name": "NYC Hosts",
        "kind": "smart",
        "host_filter": "inventory__name='US-East' and search='nyc'",
        ...
    }

In the above example, the search is limited to the "US-East" inventory and
hosts with a name containing "nyc".


### Acceptance Criteria

When verifying acceptance, ensure the following statements are true:
``

* `Inventory` has a new field named `kind` that defaults to empty and
can only be set to `smart`.
* `Inventory` has a new field named `host_filter` to empty and can only be
set to a valid _SmartFilter_ string.
* `Inventory` with a `host_filter` set and a `kind` of `smart`:
    * `hosts` list reflecting the results of searching `/api/v2/hosts` with the same
search that is set in the `host_filter`.
    * Not allow creation of Hosts
    * Not allow creation of Groups
    * Not allow creation of Inventory Sources

### API Concerns
There are no breaking or backwards-incompatible changes for this feature.


## Other Changes

### Inventory Updates All `inventory_sources`
A new endpoint `/api/v2/inventories/:id/update_inventory_sources` has been added. This endpoint
functions in the same way that `/api/v2/inventory_source/:id/update` functions for a single
`InventorySource` with the exception that it updates all of the inventory sources for the
`Inventory`.

`HTTP GET /api/v2/inventories/:id/update_inventory_sources` will list all of the inventory
sources and whether or not they will be updated when a POST to the same endpoint is made. The result of
this request will look like this:

    {
        results: [
            "inventory_source": 1, "can_update": True,
            "inventory_source": 2, "can_update": False,
        ]
    }

> *Note:* All manual inventory sources (`source=''`) will be ignored by the `update_inventory_sources` endpoint.

When making a POST to the same endpoint, the response will contain a status as well as the job ID for the update:

    POST /api/v2/inventories/:id/update_inventory_sources

    {
        results: [
            "inventory_update": 20, "inventory_source": 1, "status": "started",
            "inventory_update": 21, "inventory_source": 2, "status": "Could not start because `can_update` returned False"
        ]
    }


The response code from this action will be:

 - 200 if all inventory source updates were successful
 - 202 if some inventory source updates were successful, but some failed
 - 400 if all of the inventory source updates failed
 - 400 if there are no inventory sources in the inventory


### Background Deletion of Inventory

If a DELETE request is submitted to an inventory, the field `pending_delete` will be True until a separate task fully completes the task of deleting the inventory and all its contents.
