---
title: Improving Ascender Performance
description: Guidelines for tuning Ascender performance and scalability, including capacity planning, monitoring, database settings, and job event and scheduling settings.
weight: 70
---

This section aims to provide the guidelines for tuning Ascender for performance and scalability.

## Performance improvements

Ascender brings multiple improvements that support large scale deployments of Ascender. Major gains have been made to support workloads with many more concurrent jobs. In the past, there were issues with excessive database connections, job scheduling issues when there were thousands of pending and running jobs, and issues with successfully starting jobs when operating near 100% capacity of control nodes.

Additionally, changes have been made by default to take advantage of CPU capacity available on larger control nodes. This means customers who provision larger control nodes and want to run thousands of concurrent jobs have multiple improvements to look forward to in this release:

- [Job scheduling improvements](#job-scheduling-improvements)
- [Database resource usage improvements](#database-resource-usage-improvements)
- [Stability improvements](#stability-improvements)
- [Metrics enhancements](#metrics-enhancements)
- [LDAP login and basic authentication](#ldap-login-and-basic-authentication)

### Job scheduling improvements

When jobs are created either via a schedule, a workflow, the UI or the API, they are first created in Pending state. To determine when and where to run this job, a background task called the Task Manager collects all pending and running jobs and determines where capacity is available to run the job. In previous versions of Ascender, scheduling slowed as the number of pending and running jobs increased, and the Task Manager was vulnerable to timing out without having made any progress. The scenario exhibits symptoms of having thousands of pending jobs, available capacity, but no jobs starting.

Optimizations in the job scheduler have made scheduling faster, as well as safeguards to better ensure the scheduler commits its progress even if it is nearing time out. Additionally, work that previously occurred in the Task Manager that blocked its progress has been decoupled into separate, non-blocking work units executed by the Dispatcher.

### Database resource usage improvements

The use of database connections by running jobs has dramatically decreased, which removes a previous limit to concurrent running jobs, as well as reduces pressure on memory consumption of PostgreSQL.

Each job in Ascender is run by the `ascender-task` process on the control node that claimed it, which submits the work to the execution node via the Receptor, as well as consumes the output of the job and writes it to the database as job events itself. There is no separate callback receiver and no event queue between them.

The task process is also responsible for noticing if the job has been canceled by the user in order to then cancel the receptor work unit. In the past, the worker maintained multiple open database connections per job. This caused two main problems:

- The application would begin to experience errors attempting to open new database connections (for API calls or other essential processes) when there were more than 350 jobs running concurrently, unless users increased the maximum number of connections.
- Even idle connections consume memory. For example, in experiments done by AWS, idle connections to PostgreSQL were shown to consume at least 1.5 MB of memory. So if an Ascender administrator wanted to support running 2,000 concurrent jobs, this could result in 9GB of memory consumed on PostgreSQL from just idle connections alone.

A running job does not hold database connections of its own: every job of a task process shares that process's fixed pool of connections (see [Max Connections](#max-connections)). This means now the number of concurrent running jobs is no longer limited by the maximum number of database connections, and the risk of over-consuming memory on PostgreSQL is greatly reduced.

### Stability improvements

Notable stability improvements in this release:

- **Improvements to job reaping** - Fixed root cause of jobs in waiting getting reaped before the job ever started, which often occurred when running near 100% capacity on control and hybrid nodes.
- **Improvements in stability for Operator-based deployments** - Resolved issues with multiple control pod deployments erroneously marking each other as offline. Now scaling operator-based deployments horizontally is more stable.

### Metrics enhancements

Metrics added in this release to track:

- **ascender_database_connections_total** - Tracks current number of open database connections. When included in monitoring, can help identify when errors have occurred due to lack of available database connections.
- **callback_receiver_event_processing_avg_seconds** - Proxy for "how far behind the callback receiver workers are in processing output". If this number stays large, consider horizontally scaling the control plane and reducing the `capacity_adjustment` value on the node.

### LDAP login and basic authentication

Enhancements were made to the authentication backend that syncs LDAP configuration with the organizations and teams in Ascender. Logging in with large mappings between LDAP groups and organizations and teams is now up to 10 times faster than in previous versions.

## Capacity Planning

### Example capacity planning exercise

Determining the number and size of instances to support the desired workload must take into account the following:

- Managed hosts
- Tasks/hour per host
- Maximum number of concurrent jobs you want to support
- Maximum number of forks set on jobs
- Node size you prefer to deploy (CPU/Memory/Disk)

With this data, you can calculate the number of tasks per hour, which the cluster needs control capacity to process; as well as the number of "forks" or capacity you need to be able to run your peak load, which the cluster needs execution capacity to run.

For example, to plan for a cluster with:

- 300 managed hosts
- 1,000 tasks/hour per host, or 16 tasks per minute per host
- 10 concurrent jobs
- Forks set to 5 on playbooks
- Average event size 1 Mb
- Preferred node size of 4 cpu and 16 GB Ram with disks rated at 3000 IOPs

Known factors:

- To run the 10 concurrent jobs, you need at least (10 jobs \* 5 forks) + (10 jobs \* 1 base task impact of a job) = 60 execution capacity
- To control 10 concurrent jobs, you need at least 10 control capacity. The `ascender-task` process of a control node also runs at most `ASCENDER_TASK_WORKERS` tasks at once (default 4), whatever the node's capacity, so it must be set to at least 10.
- Running 1000 tasks \* 300 managed hosts/hour will produce at least 300,000 events/hour. You would need to run the job to see exactly how many events it produces because this is dependent on the specific task and verbosity. For example, a debug task printing "Hello World" produces 6 job events with the verbosity of 1 on one host. With a verbosity of 3, it produces 34 job events on one host. Therefore, estimate the task produces at least 6 events. That means, closer to 3,000,000 events/hour or approximately 833 events/second.

To determine how many execution and control nodes you will need, reference experiment results in the following table that show the observed event processing rate of a single control node with 5 execution nodes of equal size (API Capacity column). The default "forks" setting of job templates is 5, so using this default the maximum number of jobs a control node can dispatch to execution nodes will make 5 execution nodes of equal CPU/RAM use 100% of their capacity, arriving at the previously mentioned 1:5 ratio of control to execution capacity.

| Node | API Capacity | Default Execution Capacity | Default Control Capacity | Mean Event Processing Rate at 100% capacity usage | Mean Events Processing Rate at 50% capacity usage | Mean Events Processing Rate at 40% capacity usage |
| --- | --- | --- | --- | --- | --- | --- |
| 4 CPU @ 2.5Ghz, 16 GB RAM Control Node, max 3000 IOPs disk | 100 - 300 requests/second | n/a | 137 jobs | 1100/second | 1400/second | 1630/second |
| 4 CPU @ 2.5Ghz, 16 GB RAM Execution Node, max 3000 IOPs disk | n/a | 137 | 0 | n/a | n/a | n/a |
| 4 CPU @ 2.5Ghz, 16 GB RAM DB Node, max 3000 IOPs disk | n/a | n/a | n/a | n/a | n/a | n/a |

The Default Control Capacity is the capacity the instance reports. The number of jobs a control node actually controls at once is the smaller of that capacity and `ASCENDER_TASK_WORKERS` (default 4).

This table shows that controlling jobs competes with job event processing on the control node. Therefore, over-provisioning control capacity can have a positive impact on reducing processing times. When processing times are high, users can experience a delay between when the job runs and when they can view the output in the API or UI.

For the example workload on 300 managed hosts, executing 1000 tasks/hour per host, 10 concurrent jobs with forks set to 5 on playbooks, and an average event size 1 Mb, do the following:

- Deploy 1 execution node, 1 control node, 1 DB node of 4 CPU @ 2.5Ghz, 16 GB RAM with disk having ~3000 IOPs
- Keep default fork setting of 5 on job templates
- Set `ASCENDER_TASK_WORKERS` to at least 10 for the control node's `ascender-task` process, so that it runs the 10 concurrent jobs
- Use the capacity adjustment feature on the control node to reduce the capacity down to 16 (lowest value) to reserve more of the Control node's capacity for processing events

![Instances list with the Capacity Adjustment slider on a node set to its lowest value of 16 forks](/assets/images/perf-capacity-adj-instances.webp)

### Factors influencing node size choice

The previous exercise was done given that the cluster administrator already had a preferred node size, which happened to be the minimum recommended node size for Ascender. Increasing the RAM and CPU on nodes increases the calculated capacity of the instances. For each instance type, there are different considerations as to why you may want to vertically scale the node.

#### Control nodes

Vertically scaling a control node increases the number of jobs it can perform control tasks for, which requires both more CPU and memory. The added CPU and memory raise the instance's capacity, but its `ascender-task` process still runs at most `ASCENDER_TASK_WORKERS` tasks at once, which does not grow with the CPUs, so raise `ASCENDER_TASK_WORKERS` as well to use the added capacity. In general, scaling CPU alongside memory in the same proportion is recommended (for example, 1 CPU: 4GB RAM). Even in the case where memory consumption is observed to be high, increasing the CPU of an instance can often relieve pressure, as most memory consumption of control nodes is usually from unprocessed events.

As mentioned in the [Performance improvements](#performance-improvements) section, increasing the number of CPUs can also increase the job event processing rate of a control node. The `ascender-web` process serves web requests concurrently on all of the CPUs it has, with no fixed number of workers, so adding CPUs also lets it serve more requests. Horizontal scaling is still the way to increase API availability, since the other nodes keep serving requests when one is down.

#### Execution Nodes

Vertical scaling an execution node will provide more forks for job execution. As mentioned in the example, a host with 16 GB of memory will by default be assigned the capacity to run 137 "forks", which at the default setting of 5 forks/job, will be able to run around 22 jobs concurrently. In general, scaling CPU alongside memory in the same proportion is recommended. Like control and hybrid nodes, there is a "capacity adjustment" on each execution instance that can be used to align actual utilization with the estimation of capacity consumption Ascender makes. By default, all nodes are set to the top range of the capacity Ascender estimates the node to have. If actual monitoring data reveals the node to be over-utilized, decreasing the capacity adjustment can help bring this in line with actual usage.

Vertically scaling execution will do exactly what the user expects and increase the number of concurrent jobs an instance can run. One downside is that concurrently running jobs on the same execution node, while isolated from each other in the sense that they cannot access the other's data, can impact the other's performance, if a particular job is very resource-consumptive and overwhelms the node to the extent that it degrades performance of the entire node. Horizontal scaling of the execution plane (for example, deploying more execution nodes) can provide some additional isolation of workloads, as well as allowing administrators to assign different instances to different instance groups, which can then be assigned to Organizations, Inventories, or Job Templates. This can enable something like an instance group that can only be used for running jobs against a "production" Inventory; this way jobs for development do not end up eating up capacity and causing higher priority jobs to queue waiting for capacity.

#### Hop Nodes

Hop nodes have very low memory and CPU utilization and there is no significant motivation for vertically scaling hop nodes. A hop node that serves as the sole connection of many execution nodes to the control plane should be monitored for network bandwidth utilization; if this is seen to be saturated, changes to the network may be worth considering.

#### Hybrid nodes

Hybrid nodes perform both execution and control tasks, so vertically scaling these nodes both increases the number of jobs they can run, and how many events they can process. As on control nodes, raise `ASCENDER_TASK_WORKERS` with the capacity.

### Capacity planning for Operator based Deployments

For Operator based deployments, refer to the [Ascender Operator documentation](https://github.com/ctrliq/ascender-operator).

## Monitoring Ascender

It is a best practice to monitor your Ascender hosts both from a system level as well as at the application level. System level monitoring would include information about disk I/O, RAM utilization, CPU utilization, and network traffic.

For application level monitoring, Ascender provides Prometheus-style metrics on an API endpoint `/api/v2/metrics`. This can be used to monitor aggregate data about job status as well as subsystem performance such as for job output processing or job scheduling. See [Metrics](../metrics).

Monitoring the actual CPU and memory utilization of your hosts is important because capacity management for instances does not dynamically introspect into the actual resource usage of hosts. The resource impact of automation will vary based on what exactly the playbooks are doing. For example, many cloud or networking modules do most of the actual processing on the node running the Ansible playbook (the execution node), which can have a significantly different impact on Ascender than running `yum update` across many hosts, where the execution node spends much of the time during this task waiting on results.

If CPU or memory usage is very high, consider lowering the capacity adjustment on affected instances in Ascender. This will limit how many jobs are run on or controlled by this instance.

Using this in combination with application level metrics can help identify what was happening in the application when and if any service degradation occurred. Having information about Ascender's performance over time can be very useful in diagnosing problems or doing capacity planning for future growth.

## Database Settings

The following are configurable settings in the database that may help improve performance:

- **Autovacuuming**. Setting this PostgreSQL setting to true is a good practice. However, autovacuuming will not occur if there is never any idle time on the database. If it is observed that autovacuuming is not sufficiently cleaning up space on the database disk, then scheduling specific vacuum tasks during specific maintenance windows can be a solution.
- **GUC** parameters. Following are certain GUC (Grand Unified Configuration) parameters recommended for memory management in PostgreSQL, which is helpful for improving the performance of the database server. Recommended settings for each parameter are also provided.
  - `shared_buffers` (integer)
  - `work_mem` (integer)
  - `maintenance_work_mem` (integer)

All of these parameters reside under the `postgresql.conf` file (inside the `$PDATA` directory), which manages the configurations of the database server.

The **shared_buffers** parameter determines how much memory is dedicated to the server for caching data. Set in `postgresql.conf`, the default value for this parameter is:

```ini
#sharedPostgres_buffers = 128MB
```

The value should be set at 15%-25% of the machine's total RAM. For example: if your machine's RAM size is 32 GB, then the recommended value for `shared_buffers` is 8 GB. Please note that the database server needs to be restarted after this change.

The **work_mem** parameter basically provides the amount of memory to be used by internal sort operations and hash tables before writing to temporary disk files. Sort operations are used for order by, distinct, and merge join operations. Hash tables are used in hash joins and hash based aggregation. Set in `postgresql.conf`, the default value for this parameter is:

```ini
#work_mem = 4MB
```

Setting the correct value of the `work_mem` parameter can result in less disk-swapping, and therefore far quicker queries.

We can use the formula below to calculate the optimal `work_mem` value for the database server:

```text
Total RAM * 0.25 / max_connections
```

The `max_connections` parameter is one of the GUC parameters to specify the maximum number of concurrent connections to the database server. Please note setting a large `work_mem` can cause issues like the PostgreSQL server going out of memory (OOM), if there are too many open connections to the database.

The **maintenance_work_mem** parameter basically provides the maximum amount of memory to be used by maintenance operations like vacuum, create index, and alter table add foreign key operations. Set in `postgresql.conf`, the default value for this parameter is:

```ini
#maintenance_work_mem = 64MB
```

It is recommended to set this value higher than `work_mem`; this can improve performance for vacuuming. In general, it should be calculated as:

```text
Total RAM * 0.05
```

### Max Connections

For a realistic method of determining a value of `max_connections`, a ballpark formula for Ascender is outlined here. Each `ascender-web` and `ascender-task` process has its own pool of database connections, which holds at most `ASCENDER_DB_MAX_CONNS` connections (default 20), and one more connection outside the pool on which it listens for settings changes. Database connections therefore scale with the number of processes, not with the number of forks or jobs. The connection needs are listed here.

- Each `ascender-web` process: `ASCENDER_DB_MAX_CONNS` plus 1
- Each `ascender-task` process: `ASCENDER_DB_MAX_CONNS` plus 1
- Reserve for migrations and administrative commands such as `ascender-web migrate`, each of which runs as a process with its own pool

Each of these points represents maximum expected connection use in high-load circumstances. To apply this, consider a cluster with 3 hybrid nodes, each running one `ascender-web` and one `ascender-task` process with the default `ASCENDER_DB_MAX_CONNS` of 20.

```text
(3 nodes) x (2 processes / node) x (20 + 1 connections / process) + (reserve)
```

Adding up all the components comes out to 126 plus the reserve for this example cluster. Practically, this means that the `max_connections` should be set to something higher than this. Additional connections should be added to account for other platform components.

A pool opens connections only as they are needed, so an idle process holds fewer than `ASCENDER_DB_MAX_CONNS`. When a process has all of its connections in use, its requests and jobs wait for one to be free, so lowering `ASCENDER_DB_MAX_CONNS` lowers the connections the cluster can open at the cost of that waiting.

### Ascender Settings

Many Ascender settings are available to set via the Ascender UI or API. There are additional settings that are only available as file-based settings. Refer to product documentation about where each of these settings can be set. This section will focus on why administrators may want to adjust these values.

#### Live events in the Ascender UI

Events are broadcast to all nodes so that the events can be served over websocket to any client that connects to a control node's web service. This task is expensive, and becomes more expensive as the number of events that the cluster is producing increases as well as the number of control nodes increase, because all events are broadcast to all nodes regardless of how many clients are subscribed to particular jobs.

There are a few settings that allow you to influence behavior of how job events are displayed in the UI and served over websockets.

For large clusters with large job event loads, an easy way to avoid the additional overhead is to disable live streaming events (the events are only loaded on hard refresh to a job's output detail page). This is possible by setting `UI_LIVE_UPDATES_ENABLED` to False. This setting is not shown on the settings pages of the Ascender UI; set it through the `/api/v2/settings/ui/` endpoint:

```bash
curl -k -X PATCH -H 'Content-Type: application/json' --user admin:password \
    -d '{"UI_LIVE_UPDATES_ENABLED": false}' \
    https://<ascender_host>/api/v2/settings/ui/
```

If disabling live streaming of events is not possible, for very verbose jobs with many events, administrators can consider reducing the number of events shown per second or before truncating or hiding events in the UI. The following settings all address issues of rate or size of events.

```python
# Returned in the header on event api lists as a recommendation to the UI
# on how many events to display before truncating/hiding
MAX_UI_JOB_EVENTS = 4000

# Note: These settings may be overridden by database settings.
EVENT_STDOUT_MAX_BYTES_DISPLAY = 1024
MAX_WEBSOCKET_EVENT_RATE = 30
```

The maximum size of the Ansible callback event's `res` data structure (the full result of the module) is 25,000,000 bytes; beyond this limit the value is removed. This limit is fixed and cannot be changed by a setting.

#### Job Event Processing

Job events are saved to the database by the `ascender-task` process that runs the job, as the job's output arrives. There is no separate callback receiver, no event queue and no worker count to set. Each control node saves the events of the jobs it controls, so spreading jobs over more control nodes spreads the event processing.

#### Task Manager (Job Scheduling) Settings

Every `ascender-task` process claims pending tasks for its own node and runs them itself, so the node that claims a task is always its controller. A claim takes the oldest pending task that is not blocked by another, moves it to waiting, and chooses the instance group and execution node with capacity to run it; a task that does not fit goes back to pending, and the claim moves on to the next one. Claims are made under a database lock, so two control nodes never claim the same task.

A task process looks for work whenever a job is launched, and at least every 15 seconds, and keeps claiming tasks until nothing more can be claimed or all of its `ASCENDER_TASK_WORKERS` slots (default 4) are busy. To start more jobs at once on a control node, raise `ASCENDER_TASK_WORKERS` on that node.

## Additional Resources

For workloads with high levels of API interaction, best practices include:

- Use a load balancer
- Limit the rate
- Set max connections per node to 100
- Use dynamic inventory sources instead of individually creating inventory hosts via the API
- Use webhook notifications instead of polling for job status

Additional observations have been made in the field regarding authentication methods. For automation clients that will make many requests in rapid succession, using tokens is a best practice, because depending on the type of user, there may be additional overhead when using basic authentication. For example, LDAP users using basic authentication trigger a process to reconcile if the LDAP user is correctly mapped to particular organizations, teams and roles. Refer to [OAuth 2 Token Authentication](../authentication/oauth2-tokens) for detail on how to generate and use tokens.
