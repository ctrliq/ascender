## Ascender Capacity Determination and Job Impact

The Ascender capacity system determines how many jobs can run on an instance given the resources
available to the instance and the size of the jobs that are running (their `impact`). An instance's
capacity is computed from two things:

* how much memory the instance has (`mem_capacity`)
* how many CPUs the instance has (`cpu_capacity`)

Capacity also affects instance groups. Groups are made of instances, and an instance can belong to
several groups, so work on one instance reduces the remaining capacity of every group it belongs to.

Jobs are assigned to instance groups, not to instances (see [Clustering](./clustering.md)). When
`ascender-task` claims a task it places it right away: it picks the first of the task's preferred
instance groups with room, and an instance in that group
(`src/internal/tasks/capacity.go`). A task that does not fit stays `pending`; after 30 seconds its
explanation reads "This job is not ready to start because there is not enough available capacity."

An instance that is running nothing takes a task even when the task's impact is larger than the
instance's capacity, choosing the idle instance with the largest capacity. This keeps an
under-provisioned system from blocking jobs that would never fit.

So capacity and impact are not a zero-sum system relative to jobs and instances or instance groups.


### Resource Determination For Capacity Algorithm

The capacity algorithms determine how many `forks` an instance can run at the same time. Forks are
how many hosts Ansible itself works on simultaneously. More forks generally make jobs faster by doing
more work in parallel, at the cost of more load on the instance, which can slow work down overall.

The resources come from health checks (`src/internal/models/instance_health.go`):

* A control or hybrid node checks itself on every heartbeat: the number of CPUs the Go runtime reports
  (`runtime.NumCPU`) and the `MemTotal` of `/proc/meminfo`. The environment variables
  `SYSTEM_TASK_ABS_CPU` (for example `4` or `1500m`) and `SYSTEM_TASK_ABS_MEM` (for example `8Gi` or
  `4096M`) override them, for a node whose container is limited to less than its host has.
* An execution node is checked over the receptor mesh with `ansible-runner worker --worker-info`,
  which reports its CPUs and memory.
* Hop nodes have no capacity.

Capacity is recomputed every time health data is saved. A disabled instance, or one whose health
check failed, has a capacity of 0.


#### Memory Relative Capacity

`mem_capacity` is the memory available to jobs divided by the memory a fork needs, about `100MB`. The
algorithm reserves 2GB for the other services on the instance:

    (mem - 2048) / mem_per_fork

As an example:

    (4096 - 2048) / 100 == ~20

So an instance with 4GB of memory can run 20 forks. When `IS_K8S` is set nothing is reserved, on any
instance, because the Ascender services run in containers of their own:

    mem / mem_per_fork

`mem_per_fork` is the environment variable `SYSTEM_TASK_FORKS_MEM` (in megabytes), default `100`.


#### CPU-Relative Capacity

Ansible workloads are often CPU-bound. Then running fewer tasks at once can make each of them finish
sooner.

The `cpu_capacity` algorithm uses a number of forks per CPU, `4` by default:

    cpus * fork_per_cpu

For example, on a 4-CPU system:

    4 * 4 == 16

`fork_per_cpu` is the environment variable `SYSTEM_TASK_FORKS_CPU`, default `4`.

Both capacities are at least 1.

> **Note:** `SYSTEM_TASK_FORKS_MEM`, `SYSTEM_TASK_FORKS_CPU`, `SYSTEM_TASK_ABS_CPU` and
> `SYSTEM_TASK_ABS_MEM` are read from the environment of the `ascender-task` process that saves the
> health data, which for an execution node is the control node that checked it. They are not
> settings stored in the database or the settings file.


### Job Impacts Relative To Capacity

To choose a capacity, it helps to know how each kind of job uses it.

It's helpful to understand what `forks` mean to Ansible: https://docs.ansible.com/ansible/latest/reference_appendices/config.html#default-forks

The default forks value for Ansible is `5`. When Ascender knows that a job runs against fewer hosts
than that, the concurrency counted is the number of hosts.

Ascender adds `1` to the forks to account for the Ansible parent process. So a playbook run against
`5` hosts with `forks` of `5` has an impact of 6.

#### Impact of Job Types in Ascender

Tasks have two kinds of impact: "execution" impact on the instance that runs them, and "control"
impact on the instance that controls them.

The control impact is `1` for every kind of task. It is fixed in the code; the old
`ASCENDER_CONTROL_NODE_TASK_IMPACT` setting has no equivalent.

The execution impact (`task_impact` on the unified job) is set when the job is created:

* Jobs and ad hoc commands: `min(hosts, forks) + 1`, where `forks` is `5` when it is 0 and `hosts` is
  the inventory's host count (the slice's hosts for a sliced job, `2` for a provisioning callback;
  when the host count is unknown, a job counts `forks` hosts and an ad hoc command 5).
* Inventory updates: 1
* Project updates: 1 for a `check` update, 0 for a `run` sync (the sync of a job's own checkout,
  whose job holds the capacity)
* System jobs: 5

Project updates and system jobs run on the controller in the control plane group, so the controller
needs room for the control impact plus the execution impact. A job or inventory update on a hybrid
node that also controls it uses both impacts on that node.

Examples, with the control impact of 1:

* A `check` project update has a total impact of 2 on its controller.
* A system job has a total impact of 6 on its controller.
* A job in a container group: only the control impact applies, and its controller has a task impact
  of 1. The job counts against the container group's `max_forks` and `max_concurrent_jobs`.
* A job on a hybrid node, which both controls and executes it, has (1 for the Ansible parent
  process) + min(forks, hosts) + (1 control impact). A job with forks set to 1 has a total impact of
  3.

Each `ascender-task` controls only the tasks it claims itself, so the control impact always falls on
the node of the process that claimed the task, and it needs room there.

### Selecting the Right Capacity

Choosing between the memory and CPU algorithms means choosing between a minimum and a maximum. In
the examples above, the CPU capacity allows at most 16 forks and the memory capacity 20. The two can
differ a lot, and a balance between them is often what you want.

The instance field `capacity_adjustment` (default `1.00`) selects how much of each to use.
At `1.0` the larger value is used: the memory capacity of 20 forks in the example. At `0.0` the
smaller one is used. At `0.5` the capacity is halfway between them, `18`:

    16 + (20 - 16) * 0.5 == 18

The result is rounded down. Values above `1.00` are accepted and go past the larger value.

### Max forks and Max Concurrent jobs on Instance Groups and Container Groups

Instances have capacity, and the consumed capacity is tracked per instance. The `max_forks` and
`max_concurrent_jobs` fields of an instance group additionally limit how many forks (the sum of the
running tasks' impacts) and how many jobs may run across the whole group at once. 0 means no limit.

This is most useful for container groups, which otherwise have no limit on how many jobs are sent to
them. With a limit, jobs overflow from one container group to the next of their preferred groups,
which may be in another Kubernetes cluster or namespace.

One way to choose `max_concurrent_jobs` for a container group is from its pod spec, which sets the
resource requests and limits of a job pod. If the pod spec requests 100MB of memory and the cluster
has one worker node with 8GB of RAM, at most about 81 jobs should start at once:
(8GB * 1024 MB) // 100 MB per job pod, with floor division, is 81.

Alternatively, consider the memory the forks use. With 100MB per fork of Ansible, the 8GB worker node
should run only 81 forks at a time, which, depending on the forks and inventories of the job
templates, could be one job or 81 of them. So set `max_forks` to 81. Then either 40 jobs with 1 fork
can run (the impact of a job is forks + 1), or 2 jobs with forks set to 39.

The fields work on any instance group, not only container groups. They can enforce a limit for other
reasons: for a job template that should run at most 10 copies at a time, give it a dedicated instance
group with `max_concurrent_jobs` set to 10.
