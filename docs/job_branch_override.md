## Job Branch Override

_Background:_ Projects specify the branch, tag, or reference to use from source control
in the `scm_branch` field.

This "Branch Override" feature allows project admins to delegate branch selection to
admins of Job Templates that use that project (requiring only project
`use_role`), by enabling `allow_override` on the project. Admins of Job Templates can further
delegate that ability to users executing the Job Template
(requiring only Job Template `execute_role`) by enabling
`ask_scm_branch_on_launch` on the Job Template.

A job template can set `scm_branch` or `ask_scm_branch_on_launch` only when its
project allows it (`Project does not allow overriding branch.`). A branch
prompted at launch is refused when the project does not allow override
(`Project does not allow override of branch.`); a value equal to the
template's branch, or to the project's when the template has none, is not an
override and is always accepted. A `null` `scm_branch` at launch is refused
(`This field may not be null.`); to run the template's branch, leave the field
out. Workflow job templates can prompt for `scm_branch` too
(`ask_scm_branch_on_launch`), and pass it on to the jobs of job templates
that prompt for it. A schedule or workflow node may save a branch for a
template that prompts for it, and `null` there removes the saved branch.

The job runs with the template's `scm_branch`, or the prompted one, shown in
the job's `scm_branch`; when both are empty it runs the project's branch.

### Source Tree Copy Behavior

_Background:_ Every job run has its own private data directory.
This folder is temporary, cleaned up at the end of the job run.

This directory contains a copy of the project source tree for the given
`scm_branch` while the job is running (`makeLocalCopy` in
`src/internal/tasks/project_cache.go`).

A new copy is made for every job run.
Jobs are free to make changes to the project folder and make use of those
changes while it is still running.

#### Consequences of the Copy

1) Changes a job makes to the project folder do not persist between job
runs, whatever the project's `scm_clean` setting. `scm_clean` is still
passed to the project update playbook, where it discards local changes in
the project's own checkout.

This means that jobs that rely on content which is not committed to source
control may fail.

2) The copy leaves out the `.git` directory, so a job has no git history or
metadata of the project.


### Project Revision Concerns

_Background:_
The revision of the default branch (specified as `scm_branch` of the project)
is stored when updated, and jobs using that project will employ this revision.

Providing a non-default `scm_branch` in a job comes with some restrictions,
which are unlike the normal update behavior.
Before such a job starts, the project is always synced for that branch
(`src/internal/tasks/project_sync.go`): a project update with `launch_type`
`sync` and `scm_clean` set runs on the job's node, inside the job, and the
job's copy is taken from its result. The roles and collections of the
project's requirements are installed again for it.
If `scm_branch` is a branch identifier (not a commit hash or tag), the
newest revision of that branch is pulled from the source control remote
immediately before the job starts.
This revision is shown in the `scm_revision` field of the
job and of its project update (the job's `project_update`).
This means that offline job runs are impossible for non-default branches.
To be sure that a job is running a static version from source control,
use tags or commit hashes.

Project updates do not save the revision of all branches, only the
project default branch. After a job on another branch, the project's
checkout is left on that branch, and the next job on the default branch
finds the checkout at another revision and syncs it again.

The `scm_branch` field is not validated, so the project must update
to assure it is valid; a job whose branch cannot be checked out fails with
its sync ("Previous Task Failed").
When the project allows branch override, the `playbook` field of
Job Templates is not checked against the project's playbooks, and users will
have to launch the Job Template in order to verify presence of the expected
playbook.


### Git Refspec

Projects have a `scm_refspec` field. This is provided by
the user or left blank.

A non-blank `scm_refspec` field will cause project updates (of any type)
to pass the `refspec` field when running the Ansible
git module inside of the `project_update.yml` playbook. When the git module
is provided with this field, it performs an extra `git fetch` command
to pull that refspec from the remote. A project that allows branch override
and has no `scm_refspec` fetches `+refs/heads/*:refs/remotes/origin/*`, so
that every branch of the remote can be used.

The refspec specifies what references the update will download from the remote.
Examples:

 - `refs/*:refs/remotes/origin/*`
    This will fetch all references, including even remotes of the remote
 - `refs/pull/*:refs/remotes/origin/pull/*`
    Github-specific, this will fetch all refs for all pull requests
 - `refs/pull/62/head:refs/remotes/origin/pull/62/head`
    This will fetch the ref for that one github pull request

For large projects, users should consider performance when
using the first or second examples here.

This parameter affects availability of the project branch, and can allow
access to references not otherwise available. For example, the third example
will allow the user to supply `pull/62/head` for `scm_branch`, which would
not be possible without the refspec field.

The Ansible git module always fetches `refs/heads/*`. It will do this
whether or not a custom refspec is provided. This means that a project's
branches and tags (and commit hashes therein) can be used as `scm_branch`
no matter what is used for `scm_refspec`.

The `scm_refspec` will affect which `scm_branch` fields can be used as overrides.
For example, you could set up a project that allows branch override with the
first or second refspec example, then use this in a Job Template
that prompts for `scm_branch`, then a client could launch the Job Template when
a new pull request is created, providing the branch `pull/N/head`,
then the Job Template would run against the provided GitHub pull request reference.
