---
title: Inventories
description: Create and manage standard, smart, constructed, and federated inventories in Ascender, add groups, hosts, and sources, and run ad hoc commands.
weight: 50
---

An inventory is a collection of hosts against which jobs may be launched, the same as an Ansible inventory file. Inventories are divided into groups and these groups contain the actual hosts. Groups may be sourced manually, by entering host names into Ascender, or from one of its supported cloud providers.

<Hint type="note">

If you have a custom dynamic inventory script, or a cloud provider that is not yet supported natively in Ascender, you can also import that into Ascender. Refer to [Inventory File Importing](/admin-guide/inventory-file-importing) in the Ascender admin guide.

</Hint>

The **Inventories** window displays a list of the inventories that are currently available. The inventory list may be sorted by name and searched by type, organization, description, owners and modifiers of the inventory, or additional criteria as needed.

![Inventories list view with example inventories](/assets/images/inventories-home-with-examples.webp)

The list of inventory details includes:

- **Name**: The inventory name. Clicking the inventory name navigates to the properties screen for the selected inventory, which shows the inventory's groups and hosts. (This view is also accessible from the **Edit** (pencil) icon.)
- **Status**: The statuses are:

  - **Success**: when the inventory source sync completed successfully
  - **Disabled**: no inventory source added to the inventory
  - **Error**: when the inventory source sync completed with error

  An example of inventories of various states, including one with detail for a disabled state:

  ![Inventories list view showing inventories in various states, with one expanded to show the disabled state detail](/assets/images/inventories-home-with-status.webp)

- **Type**: Identifies whether it is a standard inventory, a Smart inventory, a constructed inventory, or a federated inventory.
- **Organization**: The organization to which the inventory belongs.
- **Actions**: The following actions are available for the selected inventory:

  - **Edit** (pencil icon): Edit the properties for the selected inventory.
  - **Copy** (copy icon): Makes a copy of an existing inventory as a template for creating a new one.

## Smart Inventories

A Smart Inventory is a collection of hosts defined by a stored search that can be viewed like a standard inventory and made to be easily used with job runs. Organization administrators have admin permission to inventories in their organization and can create Smart Inventories. A Smart Inventory is identified by `KIND=smart`. You can define a Smart Inventory using the same method being used with Search. `InventorySource` is directly associated with an Inventory.

<Hint type="note">

Smart inventories are deprecated and will be removed in a future release. Users are encouraged to consider moving to constructed inventory for enhancements and replacement.

</Hint>

The `Inventory` model has the following new fields that are blank by default but are set accordingly for Smart Inventories:

- `kind` is set to `smart` for Smart Inventories
- `host_filter` is set AND `kind` is set to `smart` for Smart Inventories.

The `host` model has a related endpoint, `smart_inventories`, that identifies a set of all the Smart Inventories a host is associated with. The membership table is updated every time a job runs against a smart inventory.

<Hint type="note">

The membership record is rebuilt only when a job starts against the smart inventory; no setting rebuilds it more often. The host's `smart_inventories` list therefore shows the smart inventories that held the host when each last ran a job, not what their filters match now. Deleting a host or an inventory removes its rows.

</Hint>

You can view actual inventories without being editable:

- Names of Host and Group created as a result of an inventory source sync
- Group records cannot be edited or moved

You cannot create hosts from a Smart Inventory host endpoint (`/inventories/N/hosts/`) as with a normal inventory. The administrator of a Smart Inventory has permission to edit fields such as the name, description, variables, and the ability to delete, but does not have the permission to modify the `host_filter`, because that would affect which hosts (that have a primary membership inside another inventory) are included in the smart inventory. Note, `host_filter` only applies to hosts inside of inventories inside of the Smart Inventory's organization.

To modify the `host_filter`, you need to be the organization administrator of the inventory's organization. Organization admins already have implicit "admin" access to all inventories inside the organization, therefore, this does not convey any permissions they did not already possess.

Administrators of the Smart Inventory can grant other users (who are not also admins of your organization) permissions like "use" and "adhoc" to the smart inventory, and these allow the actions indicated by the role, just like other standard inventories. However, this does not give them any special permissions to hosts (which live in a different inventory). It does not allow them direct read permission to hosts, or permit them to see additional hosts in the **Hosts** list, although they can still view the hosts under the smart inventory host list.

In some situations, you can modify the following:

- A new Host manually created on an Inventory with inventory sources
- In Groups that were created as a result of inventory source syncs

Hosts associated with the Smart Inventory are manifested at view time. If the results of a Smart Inventory contain more than one host with identical hostnames, only one of the matching hosts is included as part of the Smart Inventory, ordered by Host ID.

Variables on Host and Group are not changeable even as the local system admin user.

### Smart Host Filter

You can use a search filter to populate hosts for an inventory. This feature utilizes the capability of the fact searching feature.

Facts generated by an Ansible playbook during a Job Template run are stored by Ascender into the database whenever `use_fact_cache=True` is set per Job Template. New facts are merged with existing facts and are per-host. These stored facts can be used to filter hosts via the `/api/v2/hosts` endpoint, using the `GET` query parameter `host_filter`. For example: `/api/v2/hosts?host_filter=ansible_facts__ansible_processor_vcpus=8`

The `host_filter` parameter allows for:

- grouping via `()`
- use of the boolean `and` operator:

  - `__` to reference related fields in relational fields
  - `__` is used on ansible_facts to separate keys in a JSON key path
  - `[]` is used to denote a JSON array in the path specification
  - `""` can be used in the value when spaces are wanted in the value

- "classic" Django queries may be embedded in the `host_filter`

Examples:

```text
/api/v2/hosts/?host_filter=name=localhost
/api/v2/hosts/?host_filter=ansible_facts__ansible_date_time__weekday_number="3"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor[]="GenuineIntel"
/api/v2/hosts/?host_filter=ansible_facts__ansible_lo__ipv6[]__scope="host"
/api/v2/hosts/?host_filter=ansible_facts__ansible_processor_vcpus=8
/api/v2/hosts/?host_filter=ansible_facts__ansible_env__PYTHONUNBUFFERED="true"
/api/v2/hosts/?host_filter=(name=localhost or name=database) and (groups__name=east or groups__name="west coast") and ansible_facts__ansible_distribution="RedHat"
```

You can search `host_filter` by host name, group name, and Ansible facts.

The format for a group search is:

```text
groups__name=groupA
```

The format for a fact search is:

```text
ansible_facts__ansible_fips=false
```

You can also perform Smart Search searches, which consist of a host name and host description.

```text
host_filter=name=my_host
```

If a search term in `host_filter` is of string type, to make the value a number (for example, `2.66`) or a JSON keyword (for example, `null`, `true`, or `false`) valid, add double quotations around the value to prevent Ascender from mistakenly parsing it as a non-string:

```text
host_filter=ansible_facts__packages__dnsmasq[]__version="2.66"
```

### Define host filter with ansible_facts

To use `ansible_facts` to define the host filter when creating Smart Inventories, perform the following steps:

1. In the **Create new smart inventory** screen, click the **Search** (magnifying glass) icon next to the **Smart host filter** field to open a pop-up window to filter hosts for this inventory.

   ![Create new smart inventory form with the search icon next to the Smart host filter field highlighted](/assets/images/inventories-smart-create-filter-highlighted.webp)

2. In the search pop-up window, change the search criteria from **Name** to **Advanced** and select **ansible_facts** from the **Key** field.

   ![Smart host filter search window with Advanced search and the ansible_facts key selected](/assets/images/inventories-smart-define-host-filter.webp)

   If you wanted to add an Ansible fact of:

   ```text
   /api/v2/hosts/?host_filter=ansible_facts__ansible_processor[]="GenuineIntel"
   ```

   In the search field, enter `ansible_processor[]="GenuineIntel"` (no extra spaces or `__` before the value) and press **Enter**.

   ![Smart host filter search field with an ansible_processor fact entered](/assets/images/inventories-smart-define-host-filter-facts.webp)

   The resulting search criteria for the specified Ansible fact populates in the lower part of the window.

   ![Smart host filter search window showing the resulting ansible_facts search criteria](/assets/images/inventories-smart-define-host-filter-facts2.webp)

3. Click **Select** to add it to the **Smart host filter** field.

   ![Create new smart inventory form with the ansible_facts filter added to the Smart host filter field](/assets/images/inventories-smart-create-filter-added.webp)

4. Click **Save** to save the new Smart Inventory.

   The **Details** tab of the new Smart Inventory opens and displays the specified Ansible facts in the **Smart host filter** field.

   ![Details tab of the new Smart Inventory showing the ansible_facts host filter](/assets/images/inventories-smart-create-details.webp)

5. From the **Details** view, you can edit the **Smart host filter** field by clicking **Edit** and delete existing filters, clear all existing filters, or add new ones.

   ![Smart host filter field with a group of existing filters that can be edited or cleared](/assets/images/inventories-smart-define-host-filter-facts-group.webp)

## Constructed Inventories

As a platform user, this feature allows creation of a new inventory (called a constructed inventory) from a list of input inventories. The constructed inventory contains copies of hosts and groups in its input inventories, allowing jobs to target groups of servers across multiple inventories. Groups and hostvars can be added to the inventory content, and hosts can be filtered to limit the size of the constructed inventory. Constructed inventories address some limitations of the Smart Inventories host filtering model and make use of the [Ansible core constructed inventory model](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/constructed_inventory.html#ansible-builtin-constructed-inventory-uses-jinja2-to-construct-vars-and-groups-based-on-existing-inventory).

The key factors that distinguish a constructed inventory from a Smart Inventory are:

- the normal Ansible hostvars namespace is available
- they provide groups

Smart inventories take a `host_filter` as input and create a resultant inventory with hosts from inventories in its organization. Constructed inventories take `source_vars` and `limit` as inputs and transform their `input_inventories` into a new inventory, complete with groups. Groups (existing or constructed) can then be referenced in the `limit` field to reduce the number of hosts produced.

For instance, you can construct groups based on these host properties:

- RHEL major/minor versions
- Windows hosts
- Cloud based instances tagged in a certain region
- other

The examples described in the subsequent sections are organized by the structure of the input inventories.

### Group name and variables filtering

Two different conditions are demonstrated here to describe the input inventory content:

- The first condition is that the `state` variable defined on the host is set to `shutdown`
- The second condition is membership in a group with the `account_alias` variable set to `product_dev`

The variable `account_alias` is used to demonstrate a group variable. In this hypothetical, each account has its own group, with group variables giving metadata about those accounts, which is common in cloud-source inventories. These variables are shown in the general hostvars namespace in Ansible, which is why it has no special treatment in `source_vars`.

The hosts inside the input inventory fit one condition, the other condition, neither, or both. This results in four hosts total for demonstration purposes.

![Venn diagram of four hosts showing which hosts have the shutdown state, which are in the product_dev account, and which are in both](/assets/images/inventories-constructed-inventory-venn.webp)

This folder defines the inventory as an ini type named `two_conditions.ini`:

```ini
[account_1234]
host1
host2 state=shutdown

[account_4321]
host3
host4 state=shutdown

[account_1234:vars]
account_alias=product_dev

[account_4321:vars]
account_alias=sustaining
```

The goal here is to return only shutdown hosts that are present in the group with the `account_alias` variable of `product_dev`. There are two approaches to this, both shown in YAML format. The first one is recommended.

1. **Construct 2 groups, limit to intersection**

   `source_vars`:

   ```yaml
   plugin: constructed
   strict: true
   groups:
     is_shutdown: state | default("running") == "shutdown"
     product_dev: account_alias == "product_dev"
   ```

   `limit`: `is_shutdown:&product_dev`

   This constructed inventory input creates a group for both of the categories and uses the `limit` (host pattern) to only return hosts that are in the intersection of those two groups, which is documented in [host patterns in Ansible](https://docs.ansible.com/ansible/latest/inventory_guide/intro_patterns.html).

   Also, when a variable may or may not be defined (depending on the host), you can give a default, like with `| default("running")`, if you know what value it should have when it is not defined. This helps with debugging, as described in the [Debugging tips](#debugging-tips) section.

2. **Construct 1 group, limit to group**

   `source_vars`:

   ```yaml
   plugin: constructed
   strict: true
   groups:
     shutdown_in_product_dev: state | default("running") == "shutdown" and account_alias == "product_dev"
   ```

   `limit`: `shutdown_in_product_dev`

   This input creates one group that only includes hosts that match both criteria. The limit is then just the group name by itself, returning just **host2**, same as the previous approach.

#### Debugging tips

It is very important to set the `strict` parameter to `true` so that you can debug problems with your templates. If the template fails to render, you get an error in the associated inventory update for that constructed inventory.

When encountering errors, increase verbosity to get more details.

Giving a default, like with `| default("running")`, is a generic use of Jinja2 templates in Ansible. Doing this avoids errors from the particular template when you set `strict: true`. You could also set `strict: false`, and allow the template to produce an error, which results in the host not getting included in that group. However, doing so makes it difficult to debug issues in the future if your templates continue to grow in complexity.

However, you may still have to debug the intended function of the templates if they are not producing the expected inventory content. For example, if a `groups` group has a complex filter (like `shutdown_in_product_dev`) but does not contain any hosts in the resultant constructed inventory, then use the `compose` parameter to help debug. Like this:

`source_vars`:

```yaml
plugin: constructed
strict: true
groups:
  shutdown_in_product_dev: state | default("running") == "shutdown" and account_alias == "product_dev"
compose:
  resolved_state: state | default("running")
  is_in_product_dev: account_alias == "product_dev"
```

`limit`: leave blank

Running with a blank `limit` returns all hosts. You can use this to inspect specific variables on specific hosts, giving insight into where problems in the `groups` lie.

### Nested groups

The inventory contents of two groups where one is a child of the other is used here to demonstrate nested groups. The child group has a host inside of it, and the parent group has a variable defined. Due to how Ansible core works, the variable of the parent group is available in the namespace as a playbook is running, and can be used for filtering.

Define the inventory file in a YAML format named `nested.yml`:

```yaml
all:
  children:
    groupA:
      vars:
        filter_var: filter_val
      children:
        groupB:
          hosts:
            host1: {}
    ungrouped:
      hosts:
        host2: {}
```

The goal here is to filter hosts based on indirect membership in a group (because `host1` is in `groupB`, it is also in `groupA`).

#### Filter on nested group names

Use the following YAML format to filter on nested group names:

`source_vars`:

```yaml
plugin: constructed
```

`limit`: `groupA`

#### Filter on nested group property

This shows how you can filter on a group variable, even if the host is indirectly a member of that group.

In the inventory contents, you can see that `host2` is not expected to have the variable `filter_var` defined, because it is not in any of the groups. Because `strict: true` is used, use a default value so that hosts without that variable defined are handled. With this, `host2` returns `False` from the expression, as opposed to producing an error. `host1` inherits the variable from its groups, and is returned.

`source_vars`:

```yaml
plugin: constructed
strict: true
groups:
  filter_var_is_filter_val: filter_var | default("") == "filter_val"
```

`limit`: `filter_var_is_filter_val`

### Ansible facts

To create an inventory with Ansible facts, you need to run a playbook against the inventory that has `gather_facts: true`. The actual facts differ system-to-system. The following example problems exemplify some example cases and are not intended to address all known scenarios.

#### Filter on environment variables

An example problem is demonstrated here that involves filtering on environment variables using the YAML format:

`source_vars`:

```yaml
plugin: constructed
strict: true
groups:
  hosts_using_xterm: ansible_env.TERM == "xterm"
```

`limit`: `hosts_using_xterm`

#### Filter hosts by processor type

An example problem is demonstrated here that involves filtering hosts by processor type (Intel) using the YAML format:

`source_vars`:

```yaml
plugin: constructed
strict: true
groups:
  intel_hosts: "GenuineIntel" in ansible_processor
```

`limit`: `intel_hosts`

<Hint type="note">

Like with Smart Inventories, hosts in constructed inventories are not counted against an organization's host limit, because they reference the original inventory host. Also, hosts that are disabled in the original inventories are not included in the constructed inventory.

</Hint>

An inventory update run via `ansible-inventory` creates the constructed inventory contents. This is always configured to update-on-launch before a job, but you can still select a cache timeout value in case this takes too long.

When creating a constructed inventory, the API enforces that it always has one inventory source associated with it. All inventory updates have an associated inventory source, and the fields needed for constructed inventory (`source_vars` and `limit`) are fields already present on the inventory source model.

### User interface

Follow the procedure described in the subsequent section, [Add a new inventory](#add-a-new-inventory), to create a new constructed inventory.

Example of a constructed inventory details view:

![Details view of an example constructed inventory showing its input inventories, source vars, and limit](/assets/images/inventories-constructed-inventory-details.webp)

## Federated Inventories

A Federated Inventory is a type of inventory that combines multiple plain source inventories and automatically routes job execution to each source inventory's own Instance Groups. Where a constructed inventory merges hosts from multiple sources into a single combined inventory that runs as one job, a federated inventory dispatches a **separate child job per source inventory**, with each child job running on the Instance Groups belonging to that source. This makes federated inventories the correct tool when your inventories are segmented by region, cloud account, or network zone and you need each segment to execute on its own execution nodes.

A Federated Inventory is identified by `kind=federated`. It holds no hosts or groups of its own; all host and group data visible in the UI is aggregated from its input inventories for reference only.

<Hint type="note">

Federated inventories require plain (standard) inventories as inputs. Smart inventories, constructed inventories, and other federated inventories cannot be used as input inventories.

</Hint>

### The routing problem federated inventories solve

Consider two inventories pinned to regional Instance Groups:

| Inventory | Hosts | Instance Group |
| --- | --- | --- |
| East | host1, host2 | ig-east |
| West | host3, host4 | ig-west |

Running a job template against a single combined inventory (plain, smart, or constructed) executes the entire job on whichever Instance Group is assigned to that combined inventory. The per-source Instance Group assignments are ignored.

A federated inventory containing both East and West as inputs produces two simultaneous child jobs when launched: one running against the East inventory on `ig-east`, and one running against the West inventory on `ig-west`. Both appear as nodes under a single Workflow Job in the Jobs view.

![Workflow Job output for a federated inventory showing one child job per source inventory](/assets/images/inventory-federated-job-slice-output.webp)

### How federated job dispatch works

When a job template backed by a federated inventory is launched, Ascender intercepts the launch and creates a **WorkflowJob** (with `is_sliced_job=True`) in place of a single Job. One `WorkflowJobNode` is created for each input inventory that contains hosts matching the effective `limit`. Each child job receives the source inventory directly and inherits its Instance Group assignments naturally.

Key behaviors:

- Child jobs run **simultaneously**.
- Each child job uses its source inventory's Instance Groups, not those of the federated inventory itself (the federated inventory carries no Instance Group assignment).
- Source inventories that contribute **no matching hosts or groups** for the effective `limit` are skipped; no empty child job is dispatched for them.
- Simple glob patterns (for example, `web*`) are resolved against the database before dispatch using an indexed prefix query. Exact name patterns use a direct index lookup.
- A comma-separated limit (for example, `web01,db01`) is a list of patterns, as in Ansible: a source inventory is included if any pattern in the list matches it.
- A subscripted pattern (for example, `webservers[0]` or `webservers[0:2]`) is matched by its base name; Ansible picks the hosts by position at run time.
- Complex limit patterns containing `:`, `&`, or `!` operators, `~` regular expressions, and `@` limit files are passed through to all source inventories and resolved by Ansible at run time, since Ascender cannot pre-evaluate them. This means child jobs may be dispatched for inventories that end up matching no hosts after Ansible applies the full pattern.
- The resulting Workflow Job appears in the Jobs list and shows individual per-source child jobs, exactly as sliced jobs do.

![Edit details form of a federated inventory with the East and West input inventories selected](/assets/images/inventory-federated-edit.webp)

### Comparison with constructed

| Feature | Constructed Inventory | Federated Inventory |
| --- | --- | --- |
| Combines multiple inventories | Yes (via `source_vars` plugin) | Yes (direct input inventory list) |
| Respects per-source Instance Groups | No; uses combined IG | Yes; routes each source to its own |
| Requires inventory sync | Yes (update-on-launch) | No |
| Supports hostvars composition | Yes (`compose`, `groups`) | No |
| Job output | Single job | Workflow Job with per-source nodes |

### Limitations

- **No ad hoc commands**: Ad hoc commands bypass the job template launch path and run directly against the inventory. Because a federated inventory holds no hosts, ad hoc commands produce no results. Use a job template instead.
- **No inventory sync**: The federated inventory has no inventory source and does not support syncing. Host and group data come entirely from the input inventories.
- **Plain inputs only**: Input inventories must be plain (standard) inventories. Smart, constructed, and federated inventories are not supported as inputs.
- **Complex limit patterns**: Patterns using `:`, `&`, or `!`, `~` regular expressions, and `@` limit files are not pre-evaluated by Ascender and are forwarded to all source inventories.

### User interface

The **Hosts** and **Groups** tabs on a federated inventory aggregate data from all input inventories for read-only visibility. The UI offers no way to create or attach hosts or groups on a federated inventory, and the API refuses them on the inventory's own `hosts` and `groups` endpoints (`/api/v2/inventories/N/hosts/` and `/api/v2/inventories/N/groups/`) and when creating a host through `/api/v2/hosts/`. Manage hosts and groups in the underlying source inventories.

Follow the procedure described in [Add a new inventory](#add-a-new-inventory) to create a new federated inventory. Select **Add federated inventory** from the **Add** button drop-down.

![Add button drop-down on the Inventories page with the Add federated inventory option](/assets/images/inventory-federated-add-dropdown.webp)

![Create new federated inventory form with Name, Description, Organization, and Input Inventories fields](/assets/images/inventory-federated-create-new.webp)

![Hosts tab of a federated inventory listing hosts aggregated from the West and East input inventories](/assets/images/inventory-federated-hosts-view.webp)

## Inventory Plugins

Inventory updates use dynamically generated YAML files which are parsed by their respective inventory plugin. Users can provide the new style inventory plugin config directly to Ascender via the inventory source `source_vars` for all the following inventory sources:

- [Amazon Web Services EC2](#amazon-web-services-ec2)
- [Google Compute Engine](#google-compute-engine)
- [Microsoft Azure Resource Manager](#microsoft-azure-resource-manager)
- [VMware vCenter](#vmware-vcenter)
- [Red Hat Satellite 6](#red-hat-satellite-6)
- [OpenStack](#openstack)
- [CIQ Ascender Automation Platform](#ciq-ascender-automation-platform)
- [Terraform State](#terraform-state)
- [NetBox](#netbox)

Newly created configurations for inventory sources contain the default plugin configuration values. If you want your newly created inventory sources to match the output of legacy sources, you must apply a specific set of configuration values for that source. To ensure backward compatibility, Ascender uses "templates" for each of these sources to force the output of inventory plugins into the legacy format. Refer to [Supported Inventory Plugin Templates](../inventory-plugin-templates) for each source and their respective templates to help you migrate to the new style inventory plugin output.

At run time, the top-level `plugin` key of `source_vars` is set to the inventory plugin of the `InventorySource` source. For VMware vCenter, Red Hat Satellite 6, Terraform State, NetBox and CIQ Ascender Automation Platform the name is fully qualified: for example, if satellite6 is selected for the `InventorySource` then plugin is set to `theforeman.foreman.foreman`. The other sources use the plugin's short name: if ec2 is selected, plugin is set to `aws_ec2`. For VMware vCenter, a `source_vars` that selects `vmware.vmware.vms` keeps that plugin.

## Add a new inventory

Adding a new inventory involves several components:

- [Add permissions](#add-permissions)
- [Add groups](#add-groups)
- [Add hosts](#add-hosts)
- [Add source](#add-source)
- [View completed jobs](#view-completed-jobs)

To create a new standard inventory, Smart inventory, constructed inventory, or federated inventory:

1. Click the **Add** button, and select the type of inventory to create.

   The type of inventory is identified at the top of the create form.

   ![Create new inventory form](/assets/images/inventories-create-new-inventory.webp)

2. Enter the appropriate details into the following fields:

   - **Name**: Enter a name appropriate for this inventory.
   - **Description**: Enter an arbitrary description as appropriate (optional).
   - **Organization**: Required. Choose among the available organizations.
   - **Smart Host Filter**: (Only applicable to Smart Inventories) Click the **Search** (magnifying glass) icon to open a separate window to filter hosts for this inventory. These options are based on the organization you chose.

     Filters are similar to tags in that tags are used to filter certain hosts that contain those names. Therefore, to populate the **Smart Host Filter** field, you are specifying a tag that contains the hosts you want, not actually selecting the hosts themselves. Enter the tag in the **Search** field and press **Enter**. Filters are case-sensitive. Refer to the [Smart Host Filter](#smart-host-filter) section for more information.

   - **Instance Groups**: Click the **Search** (magnifying glass) icon to open a separate window. Choose the instance groups for this inventory to run on. If the list is extensive, use the search to narrow the options. You may select multiple instance groups and sort them in the order you want them run.

     ![Select Instance Groups dialog](/assets/images/select-instance-groups-modal.webp)

   - **Labels**: Optionally supply labels that describe this inventory, so they can be used to group and filter inventories and jobs.
   - **Input inventories**: Specify the source inventories to include in this inventory.

     - For **constructed inventories**: click the **Search** (magnifying glass) icon to select from available inventories. Empty groups from input inventories are copied into the constructed inventory.
     - For **federated inventories**: click the **Search** (magnifying glass) icon to select the plain source inventories whose jobs should be dispatched separately. Smart, constructed, and other federated inventories are excluded from the picker.

   - **Cache timeout (seconds)**: (Only applicable to constructed inventories) Optionally set the number of seconds a sync of the constructed inventory is considered current. When a job runs and the latest sync is older than this, a new sync is performed.
   - **Verbosity**: (Only applicable to constructed inventories) Control the level of output Ansible produces as the playbook executes related to inventory sources associated with constructed inventories. Choose the verbosity from Normal to various Verbose or Debug settings. This only appears in the "details" report view. Verbose logging includes the output of all commands. Debug logging is exceedingly verbose and includes information on SSH operations that can be useful in certain support instances. Most users do not need to see debug mode output.
   - **Limit**: (Only applicable to constructed inventories) Restricts the number of returned hosts for the inventory source associated with the constructed inventory. You can paste a group name into the limit field to only include hosts in that group. See **Source vars** below for more detail.
   - **Options**: Check the **Prevent Instance Group Fallback** option (only applicable to standard inventories) to allow only the instance groups listed in the **Instance Groups** field above to execute the job. If unchecked, all available instances in the execution pool are used based on the hierarchy described in [Control where a job runs](/admin-guide/container-instance-groups#control-where-a-job-runs). Click the **?** help icon for additional information. For Smart Inventories, set the `prevent_instance_group_fallback` option through the API.
   - **Variables** (**Source vars** for constructed inventories):

     - **Variables**: Variable definitions and values to be applied to all hosts in this inventory. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.
     - **Source vars** for constructed inventories creates groups, specifically under the `groups` key of the data. It accepts Jinja2 template syntax, renders it for every host, makes a `True`/`False` evaluation, and includes the host in the group (from the key of the entry) if the result is `True`. This is particularly useful because you can paste that group name into the limit field to only include hosts in that group. See an example in [Group name and variables filtering](#group-name-and-variables-filtering).

   ![Details of a newly saved inventory](/assets/images/inventories-create-new-saved-inventory.webp)

3. Click **Save** when done.

After saving the new inventory, you can proceed with configuring permissions, groups, hosts, sources, and view completed jobs, if applicable to the type of inventory. For more instructions, refer to the subsequent sections.

### Add permissions

1. In the **Access** tab, click the **Add** button.

2. Select a user or team to add and click **Next**.

3. Select one or more users or teams from the list by clicking the check boxes next to the names to add them as members, and click **Next**.

   ![Add Users dialog with two users selected](/assets/images/organizations-add-users-for-example-organization.webp)

   In this example, two users have been selected to be added.

4. Select the roles you want the selected users or teams to have. Be sure to scroll down for a complete list of roles. Different resources have different options available.

   ![Add Users dialog showing the roles available to apply to the selected users](/assets/images/organizations-add-users-roles.webp)

5. Click the **Save** button to apply the roles to the selected users or teams and to add them as members.

The Add Users/Teams window closes to display the updated roles assigned for each user and team.

![Access tab showing the role assignments for each user and team](/assets/images/permissions-tab-roles-assigned.webp)

To remove roles for a particular user, click the disassociate (**x**) button next to its resource.

![Role chip with the disassociate button next to the resource](/assets/images/permissions-disassociate.webp)

This launches a confirmation dialog, asking you to confirm the disassociation.

![Confirmation dialog asking you to confirm removing the role](/assets/images/permissions-disassociate-confirm.webp)

### Add groups

Inventories are divided into groups, which may contain hosts and other groups. Groups are only applicable to standard inventories and are not configurable directly through a Smart Inventory. You can associate an existing group through hosts that are used with standard inventories. There are several actions available for standard inventories:

- Create a new Group
- Create a new Host
- Run a command on the selected Inventory
- Edit Inventory properties
- View activity streams for Groups and Hosts
- Obtain help building your Inventory

<Hint type="note">

Inventory sources are not associated with groups. Spawned groups are top-level and may still have child groups, and all of these spawned groups may have hosts.

</Hint>

To create a new group for an inventory:

1. Click the **Add** button to open the **Create Group** window.

   ![Create new group form](/assets/images/inventories-add-group-new.webp)

2. Enter the appropriate details into the required and optional fields:

   - **Name**: Required
   - **Description**: Enter an arbitrary description as appropriate (optional)
   - **Variables**: Enter definitions and values to be applied to all hosts in this group. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.

3. When done, click **Save**.

#### Add groups within groups

To add groups within groups:

1. Click the **Related Groups** tab.

2. Click the **Add** button, and select whether to add a group that already exists in your configuration or create a new group.

3. If creating a new group, enter the appropriate details into the required and optional fields:

   - **Name**: Required
   - **Description**: Enter an arbitrary description as appropriate (optional)
   - **Variables**: Enter definitions and values to be applied to all hosts in this group. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.

4. When done, click **Save**.

   The **Create Group** window closes and the newly created group displays as an entry in the list of groups associated with the group that it was created for.

   ![Related Groups tab showing the newly created subgroup](/assets/images/inventories-add-group-subgroup-added.webp)

   If you chose to add an existing group, available groups appear in a separate selection window.

   ![Selection window listing existing groups to add as subgroups](/assets/images/inventories-add-group-existing-subgroup.webp)

   Once a group is selected, it displays as an entry in the list of groups associated with the group.

5. To configure additional groups and hosts under the subgroup, click the name of the subgroup from the list of groups and repeat the same steps described in this section.

#### View or edit inventory groups

The list view displays all your inventory groups at once, or you can filter it to only display the root groups. An inventory group is considered a root group if it is not a subset of another group.

You may be able to delete a subgroup without concern for dependencies, since Ascender looks for dependencies such as any child groups or hosts. If any exist, a confirmation dialog displays for you to choose whether to delete the root group and all of its subgroups and hosts, or promote the subgroups so they become the top-level inventory groups, along with their hosts.

![Delete group confirmation dialog with options to delete all groups and hosts or promote child groups and hosts](/assets/images/inventories-groups-delete-root-with-children.webp)

### Add hosts

You can configure hosts for the inventory as well as for groups and groups within groups. To configure hosts:

1. Click the **Hosts** tab.

2. Click the **Add** button, and select whether to add a host that already exists in your configuration or create a new host.

3. Enter the appropriate details into the required and optional fields:

   - **Name**: Required
   - **Description**: Enter an arbitrary description as appropriate (optional)
   - **Variables**: Enter definitions and values to be applied to all hosts in this group. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.

4. When done, click **Save**.

   The **Create Host** window closes and the newly created host displays as an entry in the list of hosts associated with the group that it was created for.

   Use the **On** toggle in the host's row of the list (or on its **Details** tab) to specify whether or not to include this host while running jobs.

   ![Hosts tab listing the newly created host](/assets/images/inventories-add-group-host-added.webp)

   If you chose to add an existing host, available hosts appear in a separate selection window.

   ![Selection window listing existing hosts to add](/assets/images/inventories-add-existing-host.webp)

   Once a host is selected, it displays as an entry in the list of hosts associated with the group. You can disassociate a host from this screen by selecting the host and clicking the **Disassociate** button.

5. To configure additional groups for the host, click the name of the host from the list of hosts.

   ![Hosts tab with the host name highlighted](/assets/images/inventories-add-group-host-added-emphasized.webp)

   This opens the **Details** tab of the selected host.

   ![Details tab of the selected host](/assets/images/inventories-add-group-host-details.webp)

6. Click the **Groups** tab to configure groups for the host.

   1. Click the **Add** button to associate the host with an existing group.

      Available groups appear in a separate selection window.

      ![Selection window listing groups to associate with the host](/assets/images/inventories-add-group-hosts-add-groups.webp)

   2. Click to select the groups to associate with the host and click **Save**.

   Once a group is associated, it displays as an entry in the list of groups associated with the host.

7. If a host was used to run a job, you can view details about those jobs in the **Jobs** tab of the host and click **Expanded** to view details about each job.

   ![Jobs tab of a host with expanded job details](/assets/images/inventories-add-host-view-completed-jobs.webp)

<Hint type="note">

You may also run ad hoc commands from the host list screen. Refer to [Running Ad Hoc Commands](#running-ad-hoc-commands) for more detail.

</Hint>

<Hint type="note">

You may create hosts in bulk using the newly added endpoint in the API, `/api/v2/bulk/host_create`. This endpoint accepts JSON and you can specify the target inventory and a list of hosts to add to the inventory. These hosts must be unique within the inventory. Either all hosts are added, or an error is returned indicating why the operation was not able to complete. Use the **OPTIONS** request to return the relevant schema.

</Hint>

### Add source

Inventory sources are not associated with groups. Spawned groups are top-level and may still have child groups, and all of these spawned groups may have hosts. Adding a source to an inventory only applies to standard inventories. Smart inventories inherit their source from the standard inventories they are associated with. To configure the source for the inventory:

1. In the inventory you want to add a source to, click the **Sources** tab.

2. Click the **Add** button.

   This opens the **Create Source** window.

   ![Create new source form](/assets/images/inventories-create-source.webp)

3. Enter the appropriate details into the required and optional fields:

   - **Name**: Required
   - **Description**: Enter an arbitrary description as appropriate (optional)
   - **Execution Environment**: Optionally search (magnifying glass icon) or enter the name of the execution environment with which you want to run your inventory imports. Refer to the [Execution Environments](../execution-environments) section for details on building an execution environment.
   - **Source**: Choose a source for your inventory. Refer to the [Inventory Sources](#inventory-sources) section for more information about each source and details for entering the appropriate information.

4. After completing the required information for your chosen [inventory source](#inventory-sources), you can continue to optionally specify other common parameters, such as verbosity, host filters, and variables.

5. Select the appropriate level of output on any inventory source's update jobs from the **Verbosity** drop-down menu.

6. Use the **Host Filter** field to specify only matching host names to be imported into Ascender.

7. In the **Enabled Variable**, specify Ascender to retrieve the enabled state from the given dictionary of host variables. The enabled variable may be specified using dot notation as `foo.bar`, in which case the lookup traverses into nested dicts, equivalent to: `from_dict.get('foo', {}).get('bar', default)`.

8. If you specified a dictionary of host variables in the **Enabled Variable** field, you can provide a value to enable on import. For example, if `enabled_var='status.power_state'` and `enabled_value='powered_on'` with the following host variables, the host would be marked enabled:

   ```json
   {
   "status": {
   "power_state": "powered_on",
   "created": "2020-08-04T18:13:04+00:00",
   "healthy": true
   },
   "name": "foobar",
   "ip_address": "192.168.2.1"
   }
   ```

   If `power_state` were any value other than `powered_on`, then the host would be disabled when imported into Ascender. If the key is not found, then the host is enabled.

9. All cloud inventory sources have the following update options:

   - **Overwrite**: If checked, any hosts and groups that were previously present on the external source but are now removed are removed from the Ascender inventory. Hosts and groups that were not managed by the inventory source are promoted to the next manually created group, or if there is no manually created group to promote them into, they are left in the "all" default group for the inventory.

     When not checked, local child hosts and groups not found on the external source remain untouched by the inventory update process.

   - **Overwrite Variables**: If checked, all variables for child groups and hosts are removed and replaced by those found on the external source. Inventory variables this source added on an earlier sync (for example from a `group_vars/all.yml` file) are removed once the source no longer provides them, unless they were edited since or another source of this inventory still provides them. When not checked, a merge is performed, combining local variables with those found on the external source.
   - **Update on Launch**: Each time a job runs using this inventory, refresh the inventory from the selected source before executing job tasks. To avoid job overflows if jobs are spawned faster than the inventory can sync, selecting this allows you to configure a **Cache Timeout** to cache prior inventory syncs for a certain number of seconds.

     The "Update on Launch" setting refers to a dependency system for projects and inventory, and it does not specifically exclude two jobs from running at the same time. If a cache timeout is specified, then the dependencies for the second job are created and it uses the project and inventory update that the first job spawned. Both jobs then wait for that project and/or inventory update to finish before proceeding. If they are different job templates, they can then both start and run at the same time, if the system has the capacity to do so. If you intend to use Ascender's provisioning callback feature with a dynamic inventory source, **Update on Launch** should be set for the inventory group.

     If you sync an inventory source that uses a project that has **Update On Launch** set, then the project may automatically update (according to cache timeout rules) before the inventory update starts.

     You can create a job template that uses an inventory that sources from the same project that the template uses. In this case, the project updates and then the inventory updates (if updates are not already in progress, or if the cache timeout has not already expired).

10. Review your entries and selections and click **Save** when done. This allows you to configure additional details, such as schedules and notifications.

11. To configure schedules associated with this inventory source, click the **Schedules** tab.

    - If schedules are already set up, review, edit, or enable/disable your schedule preferences.
    - If schedules have not been set up, refer to [Schedules](../schedules) for more information.

12. To configure notifications for the source, click the **Notifications** tab. The **Notifications** tab is only present after you save the newly created source.

    ![Inventory source details with the Notifications tab present after saving](/assets/images/inventories-create-source-with-notifications-tab.webp)

    - If notifications are already set up, use the toggles to enable or disable the notifications to use with your particular source. For more detail, see [Enable and Disable Notifications](../notifications#enable-and-disable-notifications).
    - If notifications have not been set up, refer to [Notifications](../notifications) for more information.

13. Review your entries and selections and click **Save** when done.

Once a source is defined, it displays as an entry in the list of sources associated with the inventory. From the **Sources** tab you can perform a sync on a single source, or sync all of them at once. You can also perform additional actions such as scheduling a sync process, and edit or delete the source.

![Sources tab listing the inventory sources defined for the inventory](/assets/images/inventories-view-sources.webp)

### Inventory Sources

Choose a source which matches the inventory type against which a host can be entered.

#### Sourced from a Project

An inventory that is sourced from a project means that it uses the SCM type from the project it is tied to. For example, if the project's source is from GitHub, then the inventory uses the same source.

1. To configure a project-sourced inventory, select **Sourced from a Project** from the **Source** field.

2. The **Create Source** window expands with additional fields. Enter the following details:

   - **Source Control Branch/Tag/Commit**: Optionally enter the SCM branch, tags, commit hashes, arbitrary refs, or revision number (if applicable) from the source control (Git or Subversion) to checkout. Some commit hashes and refs may not be available unless you also provide a custom refspec in the next field. If left blank, the default is HEAD, which is the last checked out Branch/Tag/Commit for this project.

     This field only displays if the sourced project has the **Allow Branch Override** option checked:

     ![Project form with the Allow Branch Override option selected](/assets/images/projects-create-scm-project-branch-override-checked.webp)

   - **Credential**: Optionally specify the credential to use for this source.
   - **Project**: Required. Pre-populates with a default project, otherwise, specify the project this inventory is using as its source. Click the **Search** (magnifying glass) icon to choose from a list of projects. If the list is extensive, use the search to narrow the options.
   - **Inventory File**: Required. Select an inventory file associated with the sourced project. If not already populated, you can type it into the text field within the drop-down menu to filter the extraneous file types. In addition to a flat file inventory, you can point to a directory or an inventory script.

     ![Inventory File drop-down filtered by typed text](/assets/images/inventories-create-source-sourced-from-project-filter.webp)

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. To pass environment variables to the custom inventory script, set them as top-level keys in the **Source variables** field: each top-level key becomes an environment variable of the inventory update, unless the update already sets that variable or it is one of `HOME`, `USER`, `_`, `TERM` or `PATH`. You may also place inventory scripts in source control and then run them from a project. See [Inventory File Importing](/admin-guide/inventory-file-importing) in the Ascender admin guide for details.

   ![Example inventory source sourced from a project](/assets/images/inventories-create-source-sourced-from-project-example.webp)

<Hint type="note">

If you are executing a custom inventory script from SCM, make sure you set the execution bit (that is, `chmod +x`) on the script in your upstream source control. If you do not, Ascender throws a `[Errno 13] Permission denied` error upon execution.

</Hint>

#### Amazon Web Services EC2

1. To configure an AWS EC2-sourced inventory, select **Amazon EC2** from the **Source** field.

2. The **Create Source** window expands with additional fields. Enter the following details:

   - **Credential**: Optionally choose from an existing AWS credential (for more information, refer to [Credentials](../credentials)).

     If Ascender is running on an EC2 instance with an assigned IAM Role, the credential may be omitted, and the security credentials from the instance metadata are used instead. For more information on using IAM Roles, refer to the [IAM roles for Amazon EC2 documentation at Amazon](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to override variables used by the `aws_ec2` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [aws_ec2 inventory plugin documentation](https://docs.ansible.com/ansible/latest/collections/amazon/aws/aws_ec2_inventory.html).

   ![Example Amazon EC2 inventory source](/assets/images/inventories-create-source-aws-example.webp)

<Hint type="note">

If you only use `include_filters`, the AWS plugin always returns all the hosts. To use this properly, the first condition on the `or` must be on `filters` and then build the rest of the `OR` conditions on a list of `include_filters`.

</Hint>

#### Google Compute Engine

1. To configure a Google-sourced inventory, select **Google Compute Engine** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing GCE Credential. For more information, refer to [Credentials](../credentials).

   ![Example Google Compute Engine inventory source](/assets/images/inventories-create-source-gce-example.webp)

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to override variables used by the `gcp_compute` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [gcp_compute inventory plugin documentation](https://docs.ansible.com/ansible/latest/collections/google/cloud/gcp_compute_inventory.html).

#### Microsoft Azure Resource Manager

1. To configure an Azure Resource Manager-sourced inventory, select **Microsoft Azure Resource Manager** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing Azure Credential. For more information, refer to [Credentials](../credentials).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to override variables used by the `azure_rm` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [azure_rm inventory plugin documentation](https://docs.ansible.com/ansible/latest/collections/azure/azcollection/azure_rm_inventory.html).

   ![Example Microsoft Azure Resource Manager inventory source](/assets/images/inventories-create-source-azurerm-example.webp)

#### VMware vCenter

1. To configure a VMware-sourced inventory, select **VMware vCenter** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing VMware Credential. For more information, refer to [Credentials](../credentials).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to override variables used by the `community.vmware.vmware_vm_inventory` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [vmware_vm_inventory inventory plugin](https://github.com/ansible-collections/community.vmware/blob/main/plugins/inventory/vmware_vm_inventory.py). The **Collection** field can switch the source to the `vmware.vmware` collection's `vmware.vmware.vms` plugin, whose variables differ.

   Starting with Ansible 2.9, VMware properties have changed from lower case to camelCase. Ascender provides aliases for the top-level keys, but lower case keys in nested properties have been discontinued. For a list of valid and supported properties starting with Ansible 2.9, refer to [virtual machine attributes in the VMware dynamic inventory plugin](https://docs.ansible.com/ansible/latest/collections/community/vmware/docsite/vmware_scenarios/vmware_inventory_vm_attributes.html).

   ![Example VMware vCenter inventory source](/assets/images/inventories-create-source-vmware-example.webp)

#### Red Hat Satellite 6

1. To configure a Red Hat Satellite-sourced inventory, select **Red Hat Satellite 6** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing Satellite Credential. For more information, refer to [Credentials](../credentials).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to specify parameters used by the foreman inventory source. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, refer to the [theforeman.foreman.foreman – Foreman inventory source](https://docs.ansible.com/ansible/latest/collections/theforeman/foreman/foreman_inventory.html) in the Ansible documentation.

   ![Example Red Hat Satellite 6 inventory source](/assets/images/inventories-create-source-rhsat6-example.webp)

If you encounter an issue with the Ascender inventory not having the "related groups" from Satellite, you might need to define these variables in the inventory source. See the inventory plugins template example for [Red Hat Satellite 6](../inventory-plugin-templates#red-hat-satellite-6) for details.

#### OpenStack

1. To configure an OpenStack-sourced inventory, select **OpenStack** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing OpenStack Credential. The credential may use either username/password or Keystone application credential authentication; both work with this source type. For more information, refer to [Credentials](../credentials).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

4. Use the **Source Variables** field to override variables used by the `openstack` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [openstack inventory plugin](https://docs.ansible.com/ansible/latest/collections/openstack/cloud/openstack_inventory.html) in the Ansible collections documentation.

   ![Example OpenStack inventory source](/assets/images/inventories-create-source-openstack-example.webp)

#### CIQ Ascender Automation Platform

1. To configure this type of sourced inventory, select **CIQ Ascender Automation Platform** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing CIQ Ascender Automation Platform Credential. For more information, refer to [Credentials](../credentials).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source).

   ![Example CIQ Ascender Automation Platform inventory source](/assets/images/inventories-create-source-rhaap-example.webp)

4. Use the **Source Variables** field to override variables used by the `controller` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.

#### Terraform State

This inventory source uses the [terraform_state](https://github.com/ansible-collections/cloud.terraform/blob/main/docs/cloud.terraform.terraform_state_inventory.rst) inventory plugin from the [cloud.terraform](https://github.com/ansible-collections/cloud.terraform) collection. The plugin parses a Terraform state file and adds hosts for AWS EC2, GCE, and Azure instances.

1. To configure this type of sourced inventory, select **Terraform State** from the **Source** field.

2. The **Create new source** window expands with the required **Credential** field. Choose from an existing Terraform backend credential. For more information, refer to [Terraform backend configuration](../credentials#terraform-backend-configuration).

3. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source). For Terraform, enable the **Overwrite** and **Update on launch** options.

4. Use the **Source Variables** field to override variables used by the `terraform` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For more information on these variables, see the [terraform_state](https://github.com/ansible-collections/cloud.terraform/blob/main/docs/cloud.terraform.terraform_state_inventory.rst) file.

   The `backend_type` variable is required by the Terraform state inventory plugin. This should match the remote backend configured in the Terraform backend credential. Here is an example for an Amazon S3 backend:

   ```yaml
   ---
   backend_type: s3
   ```

5. Enter an execution environment in the **Execution Environment** field that contains a Terraform binary. This is required for the inventory plugin to run the Terraform commands that read inventory data from the Terraform state file. Refer to the [Terraform EE readme](https://github.com/ansible-cloud/terraform_ee), which contains an example execution environment configuration with a Terraform binary.

   ![Example Terraform State inventory source](/assets/images/inventories-create-source-terraform-example.webp)

6. To add hosts for AWS EC2, GCE, and Azure instances, the Terraform state file in the backend must contain state for resources already deployed to EC2, GCE, or Azure. Refer to each of the Terraform providers' respective documentation to provision instances.

#### NetBox

This inventory source uses the [nb_inventory](https://docs.ansible.com/ansible/latest/collections/netbox/netbox/nb_inventory_inventory.html) inventory plugin from the [netbox.netbox](https://github.com/netbox-community/ansible_modules) collection. It adds the devices and virtual machines in NetBox as hosts.

1. To configure this type of sourced inventory, select **NetBox** from the **Source** field.

2. The **Create Source** window expands with the required **Credential** field. Choose from an existing NetBox credential. For more information, refer to [NetBox](../credentials#netbox).

3. Enter an execution environment in the **Execution Environment** field that contains the `netbox.netbox` collection. The default execution environment does not include it.

4. You can optionally specify the verbosity, host filter, enabled variable/value, and update options as described in the main procedure for [adding a source](#add-source). Unless you set an enabled variable, a host is enabled when its NetBox status is **Active** (`status.value` is `active`), so offline, planned and decommissioning devices are imported disabled.

5. Use the **Source Variables** field to override variables used by the `nb_inventory` inventory plugin. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two. For a detailed description of these variables, view the [nb_inventory](https://docs.ansible.com/ansible/latest/collections/netbox/netbox/nb_inventory_inventory.html) plugin documentation. The NetBox URL and API token come from the credential; do not put the token in the source variables. The credential's **Verify SSL** setting becomes the plugin's `validate_certs` unless the source variables set it. For example, to group hosts by site and device role and include config context:

   ```yaml
   group_by:
     - sites
     - device_roles
   config_context: true
   ```

### Export old inventory scripts

Ascender has no custom inventory scripts API, but the scripts saved by earlier versions are still kept in the database, in the `main_custominventoryscript` table (the `name` column holds each script's name and the `script` column its contents). Ascender has no command to export them; read them from the database with `psql` and check them into source control.

List the saved scripts:

```bash
psql -At -c "SELECT id, name FROM main_custominventoryscript ORDER BY id"
```

Write one script to a file, using its `id` from the list, and make it executable:

```bash
mkdir my_scripts
psql -At -c "SELECT script FROM main_custominventoryscript WHERE id = 11" > my_scripts/inventory_script_upperorder
chmod +x my_scripts/inventory_script_upperorder
```

Scripts can be `bash/python/ruby/more`, so choose a file name without an extension. If you execute the script (assuming it worked), it dumps the inventory data. You can verify functionality with `ansible-inventory`, which should give the same data, but reformatted.

```bash
ansible-inventory -i ./my_scripts/inventory_script_upperorder --list --export
```

In the above example, you could `cd` into `my_scripts` and then issue a `git init` command, add the scripts you want, push it to source control, and then create an SCM inventory source in the Ascender user interface.

For more information on syncing or using custom inventory scripts, refer to [Inventory File Importing](/admin-guide/inventory-file-importing) in the Ascender admin guide.

### View completed jobs

If an inventory was used to run a job, you can view details about those jobs in the **Jobs** tab of the inventory and click **Expanded** to view details about each job.

![Jobs tab of an inventory with expanded job details](/assets/images/inventories-view-completed-jobs.webp)

## Running Ad Hoc Commands

To run an ad hoc command:

1. Select an inventory source from the list of hosts or groups. The inventory source can be a single group or host, a selection of multiple hosts, or a selection of multiple groups.

   ![Hosts tab of an inventory with hosts available to select](/assets/images/inventories-add-group-host-added.webp)

2. Click the **Run Command** button.

   The **Run command** window opens.

   ![Run command window showing the Details step with Module, Arguments, Verbosity, Limit, and Forks fields](/assets/images/ad-hoc-run-execute-command.webp)

3. Enter the details for the following fields:

   - **Module**: Select one of the modules that Ascender supports running commands against: `command`, `shell`, `yum`, `apt`, `apt_key`, `apt_repository`, `apt_rpm`, `service`, `group`, `user`, `mount`, `ping`, `selinux`, `setup`, `win_ping`, `win_service`, `win_updates`, `win_group`, or `win_user`.
   - **Arguments**: Provide arguments to be used with the module you selected.
   - **Limit**: Enter the limit used to target hosts in the inventory. To target all hosts in the inventory enter `all` or `*`, or leave the field blank. This is automatically populated with whatever was selected in the previous view prior to clicking the launch button.
   - **Verbosity**: Select a verbosity level for the standard output.
   - **Forks**: If needed, select the number of parallel or simultaneous processes to use while executing the command.
   - **Show Changes**: Select to enable the display of Ansible changes in the standard output. The default is OFF.
   - **Enable Privilege Escalation**: If enabled, the playbook is run with administrator privileges. This is the equivalent of passing the `--become` option to the `ansible` command.
   - **Extra Variables**: Provide extra command line variables to be applied when running this inventory. Enter variables using either JSON or YAML syntax. Use the radio button to toggle between the two.

   ![Run command window with example module, arguments, and other fields filled in](/assets/images/ad-hoc-commands-inventory-run-command.webp)

4. Click **Next** to choose the execution environment you want the ad hoc command to be run against.

   ![Execution Environment step of the Run command window](/assets/images/ad-hoc-commands-inventory-run-command-ee.webp)

5. Click **Next** to choose the instance groups you want the ad hoc command to run on (optional).

6. Click **Next** to choose the **Machine Credential**: the credential to use when accessing the remote hosts to run the command. Choose the credential containing the username and SSH key or password that Ansible needs to log into the remote hosts.

7. If the credential prompts for passwords on launch, click **Next** to enter them in the **Credential passwords** step.

8. Click **Next** to review your choices in the **Preview** step, and click the **Launch** button.

The results display in the **Output** tab of the module's job window.

![Output tab of an ad hoc command job showing example results](/assets/images/ad-hoc-commands-inventory-results-example.webp)
