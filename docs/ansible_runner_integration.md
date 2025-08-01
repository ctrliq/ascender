## Ansible Runner Integration Overview

Much of the code in Ascender around ansible and `ansible-playbook` invocation has been removed and put into the project `ansible-runner`. Ascender now calls out to `ansible-runner` to invoke ansible and `ansible-playbook`.

### Lifecycle

In Ascender, a task of a certain job type is kicked off (_i.e._, RunJob, RunProjectUpdate, RunInventoryUpdate, etc.) in `awx/main/tasks/jobs.py`. A temp directory is built to house `ansible-runner` parameters (_i.e._, `envvars`, `cmdline`, `extravars`, etc.). The `temp` directory is filled with the various concepts in Ascender (_i.e._, `ssh` keys, `extra vars`, etc.). The code then builds a set of parameters to be passed to the `ansible-runner` Python module interface, `ansible-runner.interface.run()`. This is where Ascender passes control to `ansible-runner`. Feedback is gathered by Ascender via callbacks and handlers passed in.

The callbacks and handlers are:
* `event_handler`: Called each time a new event is created in `ansible-runner`. Ascender will dispatch the event to `redis` to be processed on the other end by the callback receiver.
* `cancel_callback`: Called periodically by `ansible-runner`; this is so that Ascender can inform `ansible-runner` if the job should be canceled or not. Only applies for system jobs now, and other jobs are canceled via receptor.
* `finished_callback`: Called once by `ansible-runner` to denote that the process that was asked to run is finished. Ascender will construct the special control event, `EOF`, with the associated total number of events that it observed.
* `status_handler`: Called by `ansible-runner` as the process transitions state internally. Ascender uses the `starting` status to know that `ansible-runner` has made all of its decisions around the process that it will launch. Ascender gathers and associates these decisions with the Job for historical observation.

### Debugging

If you want to debug `ansible-runner`, then set `AWX_CLEANUP_PATHS=False`, run a job, observe the job's `AWX_PRIVATE_DATA_DIR` property, and go the node where the job was executed and inspect that directory.

If you want to debug the process that `ansible-runner` invoked (_i.e._, Ansible or `ansible-playbook`), then observe the Job's `job_env`, `job_cwd`, and `job_args` parameters.
