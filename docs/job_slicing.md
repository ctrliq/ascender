# Job Slicing Overview

Ansible, by default, runs jobs from a single control instance. At best, a single Ansible job can be sliced up on a single system via forks but this doesn't fully take advantage of Ascender's ability to distribute work to multiple nodes in a cluster.

Job Slicing solves this problem by adding a Job Template field `job_slice_count`. This field specifies the number of **Jobs** to slice the Ansible run into. When this number is greater than one, Ascender generates a **Workflow Job** from the **Job Template** instead of a **Job**, with one node per slice, each running a job against its share of the inventory. The workflow job is then started and proceeds as though it were a normal workflow. The launch returns a **Workflow Job** (`workflow_job` in the response) when the run is sliced, and a **Job** (`job`) otherwise. Likewise, the UI redirects to the appropriate screen to display the status of the run. The sliced workflow jobs of a template are listed under `/api/v2/job_templates/N/slice_workflow_jobs/`.

The slice count can be prompted for at launch (`ask_job_slice_count_on_launch`). The number of slices is capped at the number of hosts in the inventory, so a template with a `job_slice_count` of 5 launched against an inventory of 3 hosts runs 3 slices, and against an inventory of one host a single job. A prompted slice count above 1 against an inventory too small to slice is refused (`400`, `Job inventory does not have enough hosts for slicing` under `job_slice_count`).

The code is in `src/internal/api/job_launch.go` (`createJobFromTemplate`, `effectiveSliceCount`) and `src/internal/tasks/job.go` (`slicedHosts`).


## How Hosts Are Distributed

Each slice job has a `job_slice_number` (from 1) and the `job_slice_count` of the run. Its inventory is built from the inventory's hosts in name order, taking every `job_slice_count`-th host starting with host number `job_slice_number`: with 3 slices, slice 1 gets hosts 1, 4, 7, ..., slice 2 hosts 2, 5, 8, ..., and so on. Hosts keep their group memberships and variables. The fact cache is sliced the same way.

A job template launched against a federated inventory makes one child job per input inventory instead of slices (see [Federated Inventory](./inventory/federated_inventory.md)).


## Implications for Job Execution

When jobs are sliced, they can run on any Ascender node; however, some may not run at the same time. Because of this, anything that relies on setting/sliced state (using modules such as `set_fact`) will not work as expected. It's reasonable to expect that not all jobs will actually run at the same time (*e.g.*, if there is not enough capacity in the system).


## Pinned Hosts

Distributing the inventory evenly breaks playbooks in which a play targets a host that the rest of the run depends on. The typical example is a preparatory play against `localhost` that gathers data or builds configuration for every other host: after slicing, only the slice that happens to receive `localhost` runs that play, and the remaining slices fail or behave incorrectly.

The Job Template field `job_slice_pinned_hosts` addresses exactly that problem. It takes a comma separated list of inventory host names that are excluded from the even distribution and included in **every** slice instead. Hosts named there keep their group memberships and variables in each slice. Matching is by exact host name: groups, globs and other `limit` style patterns are not supported. Names that do not match an inventory host are ignored, and the field has no effect when the job is not sliced.

Note that the scope of the field is deliberately narrow: it only guarantees that the named hosts are part of every slice's inventory. It does not decide what runs where. That control stays in the playbook, as usual: each play's `hosts:` pattern determines what actually executes on which host, so a pinned host only runs the plays that target it, and the fleet plays keep running on each slice's share of the inventory.

Because pinned hosts do not add to the work worth distributing, they are not counted when capping the slice count to the number of hosts: an inventory of 4 hosts with one pinned yields at most 3 slices. They are counted in every slice's task impact.

Keep in mind that plays targeting a pinned host run once per slice, concurrently. That is what you want for idempotent preparation on `localhost`, but be careful when pinning a shared machine, and note that `run_once` semantics become "once per slice".


## Simultaneous Execution Behavior

By default, Job Templates aren't configured to execute simultaneously (`allow_simultaneous` must be checked). The slice jobs of a run always allow simultaneous runs, even if that setting is not selected, so the slices run side by side as capacity allows. The sliced workflow job itself follows the template's `allow_simultaneous`: when it is off, a new sliced run stays pending while another job of the template is waiting or running, and the template's other jobs wait while slices are running.


## Relaunch

Relaunching a sliced workflow job (`POST /api/v2/workflow_jobs/N/relaunch/`) launches the job template again with the same prompts. It is refused when the slice count the run would get now differs from the original's (`Cannot relaunch sliced workflow job after slice count has changed.`), when the job template is gone (`Cannot relaunch slice workflow job orphaned from job template.`), and from failed nodes (`Cannot relaunch a sliced workflow job from failed nodes.`). Relaunching a single slice job (`POST /api/v2/jobs/N/relaunch/`) runs the same slice of the same inventory again. When `prevent_relaunch` is set on the job template, neither is allowed.

A sliced workflow job can be seen by those who can see its job template, and canceled by a superuser or the user who launched it; having no workflow job template, it can be deleted only by a superuser, and its `start` capability is a superuser's alone (see [Workflows](./workflow.md#workflow-create-read-update-delete-crud)). While a sliced workflow job runs, its slice jobs cannot be deleted (`Cannot delete job resource when associated workflow job is running.`).

In a workflow, a node whose job template slices runs the whole sliced workflow job as its job; retries of that node retry all slices (see [Automatic Node Retries](./workflow.md#automatic-node-retries)). What the node passes on to its children is the merged artifacts of the slice jobs that finished `successful` or `failed`, in the order they finished (see [Artifacts](./workflow.md#artifacts)).
