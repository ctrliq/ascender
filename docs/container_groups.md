# Container Groups

In a traditional Ascender installation, jobs (ansible-playbook runs) are
executed directly on a member of the cluster.  The concept of a
Container Group (working name) allows for job environments to be
provisioned on-demand as a Pod that exists only for the duration of
the playbook run. This is known as the ephemeral execution model and
ensures a clean environment for every job run.

In some cases it is desirable to have the execution environment be "always-on",
this is is done by manually creating an instance through the Ascender API or UI. 


## Configuration

A `ContainerGroup` is simply an `InstanceGroup` that has an associated Credential
that allows for connecting to an OpenShift or Kubernetes cluster.

To create a new type, add a new `ManagedCredentialType` to
`awx/main/models/credential/__init__.py` where `kind='kubernetes'`.

### Create Credential

A `Credential` must be created where the associated `CredentialType` is one of:

- `openshift_username_password`
- `openshift_token`
- `kubernetes_bearer_token`

### Create a Container Groupp

Once this `Credential` has been associated with an `InstanceGroup`, the
`InstanceGroup.kubernetes` property will return `True`.

#### Pod Customization

There will be a very simple default pod spec that lives in code.

A custom YAML document may be provided which will be merged on top of the
default pod spec.

This will allow the UI to implement whatever fields necessary, because
any custom fields (think 'image' or 'namespace') can be "serialized" as valid
`Pod` JSON or YAML. A full list of options can be found in the Kubernetes
documentation
[here](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/).

```bash
cat > api_request.json <<EOF
{
  "pod_spec_override": "spec:\n  containers:\n    - image: my-custom-image"
}
EOF

curl -Lk --user 'admin:password' \
     -X PATCH \
     -d @api_request.json \
     -H 'Content-Type: application/json' \
     https://localhost:8043/api/v2/instance_groups/2/
```
