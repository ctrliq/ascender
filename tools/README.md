# Development tools

Services to develop and test Ascender's integrations against, run beside the
development stack (`deploy/docker-compose.yml`, `make start` at the top
level). None of this is part of Ascender or its images (`.dockerignore`
leaves `tools/` out of the build context).

| Tool | For |
|------|-----|
| [NetBox](netbox/README.md) | The `netbox` inventory source |

## How the tools work

Each tool is a directory here with:

- `compose.yml`: a compose project of its own (`ascender-<tool>`), so
  starting and stopping a tool never touches the development stack or the
  other tools. Its containers join the development stack's network,
  `ascender`, where the task container and the tool reach each other by
  service name; the stack must therefore be up first.
- `<tool>.mk`: the tool's targets, named `<tool>-*`, which `tools/Makefile`
  includes.
- `README.md`: what it is for and how to use it.

Run the targets from this directory (or `make -C tools ...`); `make help`
lists them. `tools/Makefile` is separate from the top-level one and finds
compose the same way (podman compose when it works, else docker compose;
`COMPOSE_CMD` overrides).

## Settings

Per-machine settings go in `tools/.env`, as plain `KEY=value` lines
(git-ignored; `tools/.env.example` lists them). A variable set on the command
line or in the environment wins over the file. These apply to every tool:

| Variable | Meaning | Default |
|----------|---------|---------|
| `ASCENDER_NETWORK` | The development stack's network the tools join | `ascender` |
| `TASK_CONTAINER` | The development stack's task container, where execution environments are loaded | `ascender_task` |

## Adding a tool

Make a directory with a `compose.yml` that sets `name: ascender-<tool>` and
joins the network as an external one:

```yaml
networks:
  default:
    name: ${ASCENDER_NETWORK:-ascender}
    external: true
```

Add a `<tool>.mk` with its `<tool>-*` targets (with `## ` help text and a
`##@` heading, as `netbox/netbox.mk` has) and a `README.md`, list it in the
table above, and put its settings in `tools/.env.example`.
