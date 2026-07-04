# Job Slicing Overview

Ansible, by default, runs jobs from a single control instance. At best, a single Ansible job can be sliced up on a single system via forks but this doesn't fully take advantage of Ascender's ability to distribute work to multiple nodes in a cluster.

Job Slicing solves this problem by adding a Job Template field `job_slice_count`. This field specifies the number of **Jobs** to slice the Ansible run into. When this number is greater than one, `Ascender` will generate a **Workflow** from a **Job Template** instead of a **Job**. The **Inventory** will be distributed evenly amongst the sliced jobs. The workflow job is then started and proceeds as though it were a normal workflow.  The API will return either a **Job** resource (if `job_slice_count` < 2) or a **WorkflowJob** resource otherwise. Likewise, the UI will redirect to the appropriate screen to display the status of the run.


## Implications for Job Execution

When jobs are sliced, they can run on any Ascender node; however, some may not run at the same time. Because of this, anything that relies on setting/sliced state (using modules such as `set_fact`) will not work as expected. It's reasonable to expect that not all jobs will actually run at the same time (*e.g.*, if there is not enough capacity in the system)


## Pinned Hosts

Distributing the inventory evenly breaks playbooks in which a play targets a host that the rest of the run depends on. The typical example is a preparatory play against `localhost` that gathers data or builds configuration for every other host: after slicing, only the slice that happens to receive `localhost` runs that play, and the remaining slices fail or behave incorrectly. Until now the only options were to not slice such playbooks at all, or to restructure them so no play depends on another host.

The Job Template field `job_slice_pinned_hosts` addresses exactly that problem. It takes a comma separated list of inventory host names that are excluded from the even distribution and included in **every** slice instead. Hosts named there keep their group memberships and variables in each slice. Matching is by exact host name: groups, globs and other `limit` style patterns are not supported. Names that do not match an inventory host are ignored, and the field has no effect when the job is not sliced.

Note that the scope of the field is deliberately narrow: it only guarantees that the named hosts are part of every slice's inventory. It does not decide what runs where. That control stays in the playbook, as usual: each play's `hosts:` pattern determines what actually executes on which host, so a pinned host only runs the plays that target it, and the fleet plays keep running on each slice's share of the inventory.

Because pinned hosts do not add to the work worth distributing, they are not counted when capping the slice count to the number of hosts: an inventory of 4 hosts with one pinned yields at most 3 slices.

Keep in mind that plays targeting a pinned host run once per slice, concurrently. That is what you want for idempotent preparation on `localhost`, but be careful when pinning a shared machine, and note that `run_once` semantics become "once per slice".


## Simultaneous Execution Behavior

By default, Job Templates aren't normally configured to execute simultaneously (`allow_simultaneous` must be checked). Slicing overrides this behavior and implies `allow_simultaneous`, even if that setting is not selected.
