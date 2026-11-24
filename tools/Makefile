# Development tools that run beside Ascender's development stack
# (deploy/docker-compose.yml): services to develop and test integrations
# against. Run from this directory (`make help`), or `make -C tools ...`.
#
# Each tool is a directory with its own compose project (compose.yml) and a
# <tool>.mk with its targets, which this file includes. The tools join the
# development stack's network (ascender), so start that first (`make start`
# at the top level). See README.md.

TOOLS_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))

# Per-machine settings (ports, bind addresses) go in .env in this directory,
# as plain KEY=value lines (git-ignored; .env.example lists them). A
# variable set on the command line or in the environment wins over the file.
ENV_FILE ?= $(TOOLS_DIR)/.env
ifneq ($(wildcard $(ENV_FILE)),)
ENV_VARS := $(shell sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' '$(ENV_FILE)')
$(foreach v,$(ENV_VARS),$(if $(filter environment command,$(firstword $(origin $(v)))),,$(eval $(v) := $(shell sed -n 's/^[[:space:]]*$(v)=//p' '$(ENV_FILE)' | tail -n 1))))
ifneq ($(strip $(ENV_VARS)),)
export $(ENV_VARS)
endif
endif

# podman compose when it works, else docker compose (COMPOSE_CMD overrides).
PODMAN_COMPOSE_WARNING_LOGS ?= false
export PODMAN_COMPOSE_WARNING_LOGS
ifeq ($(origin COMPOSE_CMD),undefined)
COMPOSE_CMD := $(shell if podman compose version >/dev/null 2>&1; then echo podman compose; elif docker compose version >/dev/null 2>&1; then echo docker compose; fi)
endif
COMPOSE_BIN = $(if $(strip $(COMPOSE_CMD)),$(COMPOSE_CMD),$(error neither podman compose nor docker compose found))
# The engine behind the compose command, for building and loading images.
ENGINE = $(if $(findstring docker,$(COMPOSE_CMD)),docker,podman)
# The development stack's network, which every tool joins, and its task
# container, which runs the execution environments.
ASCENDER_NETWORK ?= ascender
TASK_CONTAINER ?= ascender_task
export ASCENDER_NETWORK

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^##@/ {printf "\n%s\n", substr($$0, 5)} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: require-network
require-network:
	@$(ENGINE) network inspect '$(ASCENDER_NETWORK)' >/dev/null 2>&1 || { echo "The network $(ASCENDER_NETWORK) does not exist: start the development stack first (make start at the top level)" >&2; exit 1; }

include $(sort $(wildcard $(TOOLS_DIR)/*/*.mk))
