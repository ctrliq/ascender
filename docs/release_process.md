# Releasing Ascender

A release of Ascender is a GitHub release of this repository. Publishing one
runs `.github/workflows/release.yml` ("Release Images"), which checks the
tagged commit, builds the two images for it, signs them, and moves `:latest`
when the release is the newest one. Nothing else is published: there is no
staging or promotion workflow to run by hand.

How the images are built, and what they contain, is in
[Building the Ascender Images](./build_images.md).

Not covered here: the Kubernetes operator (released from the operator
repository, with its OperatorHub submissions), Ansible collections, and
release announcements.


## Before releasing

Every pull request runs `.github/workflows/ci.yml`: formatting (gofmt, the
template layout, the API's JSON), `go mod tidy`, the Go module licenses, the build and `go vet`; `make lint`; `make test`
against a PostgreSQL database; `govulncheck` (informational, it does not
fail the run); and a build and smoke test of both images. Every push to
`main` then publishes development images (`devel_images.yml`, see
[Published images](./build_images.md#published-images)), which can be
tried before the commit is released.


## Publishing a release

1. On the repository's Releases page, draft a new release and give it a new
   tag on the commit to release. Tags so far are plain versions, such as
   `26.0.1`. The image version is the tag with a leading `v` removed, and it
   must be a valid image tag (letters, digits, `_`, `.` and `-`, at most 128
   characters, not starting with `.` or `-`); otherwise the workflow stops
   at its first job.
2. Write the release notes, and mark the release as a pre-release if it is
   one.
3. Publish it. A draft starts nothing; the workflow runs on the `published`
   event.

The workflow then runs these jobs:

| Job | Does |
| --- | --- |
| `version` | Works out the version from the tag, and whether `:latest` should move: yes for a release, no for a pre-release |
| `checks` | Checks out the tag and runs `make fmt-check`, `make tidy-check`, `make licenses-check`, `make vet` and `make test GOTESTFLAGS='-race -count=1'`. It loads the schema into a PostgreSQL service first, as the CI test job does, so the database-backed tests run too. The images are built only when this passes |
| `images` | Builds `ascender-web` and `ascender-task` from the tag for `linux/amd64` and `linux/arm64`, without a layer cache, with `ASCENDER_VERSION` set to the version, and pushes them as `ghcr.io/ctrliq/ascender/ascender-{web,task}:<version>` with an SBOM and build provenance. Each image is signed with cosign (keyless, through the workflow's GitHub OIDC identity) and given a build provenance attestation, both on its digest |
| `promote` | Moves `:latest` (see below) |

Each image's digest, version, platforms and tags are in the run's summary.
To verify a release image's signature and attestation, see
[Published images](./build_images.md#published-images).

Runs for one release tag queue rather than cancel each other.


## When `:latest` moves

`promote` points `ghcr.io/ctrliq/ascender/ascender-web:latest` and
`ascender-task:latest` at the release's images, both at once, and only once
both are built. It copies the multi-arch image index under the new tag with
`docker buildx imagetools create`, so nothing is rebuilt, and the
signatures and attestations, made on the digest, still apply.

For a published release it does this only when the release is the
repository's latest release, as GitHub reports it. A pre-release leaves
`:latest` alone, and so does an older release whose build finishes after a
newer one's. `promote` runs for one release at a time, across all releases.
So `ascender-web:latest` and `ascender-task:latest` always come from the same
release, and never go back to an older one by themselves.


## Rebuilding a release

The workflow can be run by hand (Actions, "Release Images", "Run workflow")
to rebuild the images of a release that exists, for example to pick up a
fixed base image. It takes two inputs:

- `tag`: the release tag to build. It must exist.
- `latest`: also move `:latest` to this build (on by default).

A manual run goes through the same `checks`, `images` and `promote` jobs.
The rebuilt images replace the release's `<version>` tags. When `latest` is
on, `:latest` moves to the rebuild whether or not the tag is the latest
release, which is also how `:latest` is pointed back at an earlier release.
The workflows never delete an image or a tag.
