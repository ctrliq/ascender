Relaunch a workflow job:

Make a POST request to this endpoint to launch a workflow job identical to the parent workflow job. This will spawn jobs, project updates, or inventory updates based on the unified job templates referenced in the workflow nodes in the workflow job.

Two optional parameters are accepted:

* `nodes`: set it to `failed` to run the nodes that did not succeed and everything downstream of them, carrying the nodes that already succeeded forward instead of running them again.
* `extra_vars`: variables that overwrite the ones the original run used. They are only accepted together with `nodes=failed`, and only when the workflow job template has `allow_overwrite_flow_vars_on_relaunch` enabled. Answers to password questions of the survey may be left as `$encrypted$` to keep the value the original run used.

If successful, the response status code will be 201 and serialized data of the new workflow job will be returned.
