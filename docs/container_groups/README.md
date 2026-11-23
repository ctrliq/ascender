# Container Groups

On instances, jobs (`ansible-playbook` runs) execute directly on a member of
the cluster: a hybrid node or an execution node. A container group instead
runs each job in a Kubernetes pod made for it, which exists only for the
duration of the run. This is the ephemeral execution model, and it gives
every job a clean environment.

Where an execution environment should be "always on" instead, add execution
nodes: through the API or UI on Kubernetes, or with `ascender-web
provision_instance` elsewhere (see [Clustering](../clustering.md)).

Jobs, ad hoc commands and inventory updates can run in a container group.
Project updates and system jobs always run in the control plane group.

## Configuration

A container group is an instance group with `is_container_group` set. It has
no instances, and its policy fields (`policy_instance_list`,
`policy_instance_minimum`, `policy_instance_percentage`) cannot be set. Its
`max_concurrent_jobs` and `max_forks` limit how much runs in it at once (see
[Capacity](../capacity.md)).

On Kubernetes, `ascender-task` registers the default container group itself
when it starts (`DEFAULT_EXECUTION_QUEUE_NAME`, `default`); see
[Clustering](../clustering.md).

### Connecting to the cluster

A container group reaches its cluster in one of three ways:

- **With a credential.** The credential's type must be "OpenShift or
  Kubernetes API Bearer Token" (`kubernetes_bearer_token`), the only managed
  credential type of kind `kubernetes`. It holds the API endpoint, a bearer
  token, whether to verify the API's certificate, and optionally the
  certificate authority to verify it with. Associating a credential requires
  `is_container_group: true` in the same request.
- **Without a credential.** `ascender-task` uses the service account of the
  pod it runs in (in-cluster configuration), so this works only when
  `ascender-task` runs in a Kubernetes pod.
- **Behind a mesh node.** `mesh_node` names a hop node of the receptor mesh,
  and that node's receptor creates the pods in its own cluster with its own
  service account (receptor's `kubernetes-incluster-auth` work type, which
  that receptor must offer). Such a group cannot have a credential, the hop
  node must serve its control service over TLS, and the control node needs a
  receptor to reach it. Only a superuser can point a group at a different
  mesh node, and a hop node that runs a group's pods cannot be deprovisioned.

The old application also documented `openshift_username_password` and
`openshift_token` credential types; they do not exist.

[`service-account.yml`](./service-account.yml) creates a service account and
the role a container group's credential needs in a namespace, and shows how
to read its token and CA certificate.

### Creating a container group

```bash
cat > api_request.json <<EOF
{
  "name": "my-container-group",
  "is_container_group": true,
  "credential": 3
}
EOF

curl -L --user 'admin:password' \
     -X POST \
     -d @api_request.json \
     -H 'Content-Type: application/json' \
     https://ascender.example.com/api/v2/instance_groups/
```

Only a superuser can create instance groups.

### Pod customization

Every job pod starts from a default pod spec (`defaultPodSpec` in
`src/internal/tasks/container_group.go`):

- namespace: the namespace `ascender-task` runs in (`MY_POD_NAMESPACE`), or
  `default`;
- a label named by `ASCENDER_CONTAINER_GROUP_DEFAULT_JOB_LABEL` (default
  `ansible_job`), with a preferred anti-affinity that spreads job pods across
  nodes;
- service account `default`, without its token mounted;
- one container, `worker`, requesting 250m of CPU and 100Mi of memory.

The group's `pod_spec_override`, a YAML (or JSON) document, is merged on top
of it: mappings are merged key by key, and anything else, lists included,
replaces what the default has. A full list of options is in the Kubernetes
documentation
[here](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/).

```bash
cat > api_request.json <<EOF
{
  "pod_spec_override": "metadata:\n  namespace: my-namespace\nspec:\n  containers:\n    - name: worker\n      resources:\n        requests:\n          cpu: 500m\n          memory: 1Gi\n"
}
EOF

curl -L --user 'admin:password' \
     -X PATCH \
     -d @api_request.json \
     -H 'Content-Type: application/json' \
     https://ascender.example.com/api/v2/instance_groups/2/
```

Because lists are replaced, an override that lists `containers` replaces the
default container's other fields (its resource requests, for example) with
its own. Whatever the override says, Ascender then sets:

- the first container's `image` to the job's execution environment and its
  `args` to `ansible-runner worker --private-data-dir=/runner`, and its
  `imagePullPolicy` from the execution environment's `pull` option when that
  is set;
- the pod's name, `automation-job-<job id>`, and the labels `ansible-awx`
  (the installation's `INSTALL_UUID`) and `ansible-awx-job-id`;
- `stdin`, `stdinOnce` and `restartPolicy: Never`, and the annotation
  `ascender/controller-node` (not for a group behind a mesh node).

When the execution environment has a registry credential, `ascender-task`
creates a `kubernetes.io/dockerconfigjson` secret from it in the pod's
namespace and names it in `imagePullSecrets`, replacing the secret when the
credential changes. This needs `get`, `create` and `delete` on secrets. A
group behind a mesh node cannot do this: a pull secret has to exist in that
cluster already and be named in the override.

With the `ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S` setting on, the paths of
`ASCENDER_ISOLATION_SHOW_PATHS` are mounted into the pod as `hostPath`
volumes. With `ASCENDER_RUNNER_KEEPALIVE_SECONDS` above 0, the worker is
given `ANSIBLE_RUNNER_KEEPALIVE_SECONDS` and sends a message that often, to
keep idle connections open.

## How a job runs in a container group

`ascender-task` talks to the Kubernetes API itself
(`src/internal/tasks/k8s.go`, `src/internal/tasks/container_group.go`):

1. It creates the pod and waits for the worker container to run, for at most
   `ASCENDER_CONTAINER_GROUP_POD_PENDING_TIMEOUT` (an environment variable, a
   duration such as `2h`, the default, or `30m`). An image that cannot be
   pulled, or a container that cannot be created, fails the job at once.
2. It attaches to the pod and sends the job (its private data directory and
   the runner's arguments) on the container's standard input, as
   `ansible-runner transmit` would.
3. It reads the worker's status, events and artifacts from the container's
   standard output.
4. When the job is done, it deletes the pod.

For a group behind a mesh node the pod spec goes to the hop node's receptor
as a work unit instead, and receptor creates the pod and streams it.

When the cluster refuses the pod because the namespace's resource quota is
used up (its message says `exceeded quota`), the job goes back to `pending`
with the explanation "The job was re-queued because its container group's
namespace had used up its resource quota when its pod was created.", and the
task manager starts it again on a later pass. A job that cannot be run again,
one launched with passwords typed in at launch, fails with the cluster's
message instead. Any other refusal fails the job with `Error creating pod:`
and the message.

While the job runs, it holds a job monitor lease. If `ascender-task` shuts
down or is lost, the pod keeps running and another control node takes the
lease over and reads the rest of the output from the pod's log (see
[the job monitor lease](../job_monitor_lease.md)).

Every minute, the scheduler pass also deletes the pods of jobs that finished
more than `K8S_POD_REAPER_GRACE_PERIOD` seconds ago (an environment variable,
default 60) in every container group without a mesh node. It looks only at
pods in the namespace of the group's pod spec that carry the installation's
`ansible-awx` label and the `ascender/controller-node` annotation.

With the `RECEPTOR_RELEASE_WORK` setting off (Settings > Troubleshooting), the pod of a
job that ran to the end is kept for debugging, and the reaper does nothing;
a canceled job's pod is still deleted.

> **Note:** the old application had receptor create container group pods
> (its `kubernetes-runtime-auth` and `kubernetes-incluster-auth` work types).
> `ascender-task` creates them directly, so it needs network access to the
> cluster's API, and receptor is used only for groups behind a mesh node. The
> annotation keeps the reaper away from pods the old application created in a
> namespace the two share.
