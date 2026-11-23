# Building the Ascender Images

Ascender runs as two container images, built from the same source:

| Image | Dockerfile | Runs |
| --- | --- | --- |
| `ascender-web` | `deploy/Dockerfile.web` | The REST API and the UI, on port 8070 |
| `ascender-task` | `deploy/Dockerfile.task` | Background work: jobs, project and inventory syncs, workflows, schedules |

Both Dockerfiles take the repository root as their build context: they copy
`src/` (the Go module), `LICENSE`, `NOTICE.txt` and `licenses/`, and the
task image also copies `deploy/podman/containers.conf`. `.dockerignore`
keeps the local secrets (`.secrets/`), `.env`, `bin/` and `docs/` out of the
context, except `docs/docsite/`, the guides the web image serves under
`/docs/`.

How the containers are run and configured is in
[deploy/README.md](../deploy/README.md).


## Building locally

The Makefile builds both images with docker compose
(`deploy/docker-compose.yml`):

```bash
make images                 # build both images
make images SERVICES=web    # or only one of them
make start                  # build the images and start the stack
make restart                # rebuild and recreate the containers
```

These targets need the database password and `SECRET_KEY` in `.secrets/` (or
the environment), even `make images`, which only builds; see
[deploy/README.md](../deploy/README.md#local-development). Compose names the
images after its project, `deploy-web` and `deploy-task`.

To build an image without compose, run `docker build` (or `podman build`)
from the repository root:

```bash
docker build -f deploy/Dockerfile.web -t ascender-web:dev .
docker build -f deploy/Dockerfile.task -t ascender-task:dev .
```

The version the image reports (`/api/v2/ping/` and `/api/v2/config/` for the
web image; the task process logs it at startup) is the build argument
`ASCENDER_VERSION`, `26.0.0-go.dev` unless it is given, as it is not by
`make images`:

```bash
docker build -f deploy/Dockerfile.web --build-arg ASCENDER_VERSION=26.0.1 -t ascender-web:26.0.1 .
```

The Go binaries are compiled in a `golang:1.27` stage on the build host's own
platform and cross-compiled for the target (`CGO_ENABLED=0`, `-trimpath`,
stripped), so a multi-platform build with `docker buildx build --platform
linux/amd64,linux/arm64` runs only the package installs of the other
platform under emulation.

Base images are pinned by digest, with the tag kept beside it for reading;
Dependabot (`.github/dependabot.yml`) moves both. They are named in full
and none comes from Docker Hub, which rate-limits anonymous pulls: Rocky
Linux from `quay.io/rockylinux/rockylinux`, Go from AWS's copy of the
Docker official images, `public.ecr.aws/docker/library/golang`.


## What the images contain

Both images run as the user `ascender` (uid 1000, group 0), carry the
`owner` and `repo` labels, and ship the licenses of this project and of
every Go module compiled into the binary under
`/usr/share/licenses/ascender/`. Neither has Python: templates and regular
expressions users write are handled by the binaries themselves.

### ascender-web

- Rocky Linux 9 `ubi-micro`, which has no package manager. The build
  installs into a copy of its root filesystem the CA certificates and the
  package updates published since the base image, and adds the `ascender`
  user. The final image is that root filesystem, assembled from `scratch`.
- `/usr/bin/ascender-web`, the entrypoint, with the UI's templates and
  static files embedded.
- `/var/lib/ascender` (the external log queue's spool) and
  `/var/log/ascender`, owned by the `ascender` user.
- Port 8070 exposed.

### ascender-task

- Rocky Linux 9 `minimal` (microdnf), with `podman`, `crun`,
  `fuse-overlayfs` and `slirp4netns` from Rocky's repositories, and the
  package updates published since the base image. Playbooks, project
  updates included, run in execution environment images through this
  rootless podman; see [deploy/README.md](../deploy/README.md) for why the
  container runs privileged.
- Podman's settings for running nested: `deploy/podman/containers.conf` as
  `/etc/containers/containers.conf`, image layers stacked with
  `fuse-overlayfs`, and no unqualified search registries, so execution
  environment images must be named in full (`ghcr.io/...`).
- Subordinate user and group ids (`100000:65536`) for the `ascender` user,
  whose home directory, `/var/lib/ascender`, holds `projects`,
  `job_status`, `job_private` and podman's image storage
  (`.local/share/containers`).
- `/usr/bin/ascender-task`, the entrypoint.
- No git: project checkouts are written from the projects' own content, and
  git runs only inside execution environments.


## Published images

The images are built and pushed to GitHub Container Registry by GitHub
Actions. `.github/workflows/images.yml` does the building for the other
workflows (it does not run by itself): it builds `ascender-web` and
`ascender-task` side by side, pushes them under one registry path, and
gives every image an SBOM and build provenance (`provenance: mode=max`,
`sbom: true`), the `org.opencontainers.image.title` and
`org.opencontainers.image.version` labels, and `ASCENDER_VERSION`.

| Workflow | Runs on | Images | Platforms | Signed |
| --- | --- | --- | --- | --- |
| `devel_images.yml` | Every push to `main` (or a manual run on `main`) | `ghcr.io/ctrliq/ascender-devel/ascender-{web,task}:{main,latest,sha-<commit>}` | `linux/amd64` | No |
| `release.yml` | Publishing a GitHub release (or a manual run) | `ghcr.io/ctrliq/ascender/ascender-{web,task}:{<version>,latest}` | `linux/amd64`, `linux/arm64` | Yes |

A development image's version is the date and commit,
`YYYY.M.D+git<commit>`. A newer push to `main` cancels a development build
still running. Development builds reuse the GitHub Actions layer cache,
which pull request CI also builds from.

A release image's version, and its tag, is the release's tag without a
leading `v`. Release builds start without a cache, so every package update
published by then is in the image. Each release image is signed with
cosign, keyless, through the workflow's own GitHub OIDC identity
(Sigstore), and given a build provenance attestation pushed to the
registry. Both are made on the image's digest, not its tag. To verify them:

```bash
cosign verify ghcr.io/ctrliq/ascender/ascender-web@<digest> \
  --certificate-identity-regexp '^https://github.com/ctrliq/ascender/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

gh attestation verify oci://ghcr.io/ctrliq/ascender/ascender-web:<version> --repo ctrliq/ascender
```

When `:latest` moves for a release, and how to rebuild a release's images,
is in [Releasing Ascender](./release_process.md).

Pull requests build both images too (`.github/workflows/ci.yml`, for
`linux/amd64`, without pushing them) and smoke test them: the binary is
there, it renders a template, and the task image has podman and no git.
