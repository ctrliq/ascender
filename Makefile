# Ascender (Go rewrite). Run `make help` for the targets.
#
# The Go module lives in src/; binaries are written to bin/. The docker
# targets drive deploy/docker-compose.yml, which needs ASCENDER_DB_PASSWORD
# and SECRET_KEY_FILE. Both come from .secrets/ when it has them
# (.secrets/ASCENDER_DB_PASSWORD, .secrets/SECRET_KEY); the environment or
# the command line overrides either. A new checkout has both generated
# (scripts/init-secrets.sh). An optional .secrets/ADMIN_PASSWORD
# (ADMIN_PASSWORD_FILE) is the admin account's password.

SRC      := src
BIN      := $(CURDIR)/bin
COMMANDS := ascender-web ascender-task
# The Go `make init` installed in /usr/local/go, which a login puts first on
# the PATH (/etc/profile.d/ascender-golang.sh): first here too, before then.
ifneq ($(wildcard /etc/profile.d/ascender-golang.sh),)
ifeq ($(findstring :/usr/local/go/bin:,:$(PATH):),)
export PATH := /usr/local/go/bin:$(PATH)
endif
endif
# podman compose when it works, else docker compose (COMPOSE_CMD overrides).
# Only the targets that run compose fail when neither is found.
# podman compose announces the external provider it runs on every call.
PODMAN_COMPOSE_WARNING_LOGS ?= false
export PODMAN_COMPOSE_WARNING_LOGS
ifeq ($(origin COMPOSE_CMD),undefined)
COMPOSE_CMD := $(shell if podman compose version >/dev/null 2>&1; then echo podman compose; elif docker compose version >/dev/null 2>&1; then echo docker compose; fi)
endif
COMPOSE   = $(if $(strip $(COMPOSE_CMD)),$(COMPOSE_CMD),$(error neither podman compose nor docker compose found)) -f deploy/docker-compose.yml
# Compose checks the file's required variables on every command; commands
# that start nothing get a placeholder password.
COMPOSE_ANY = ASCENDER_DB_PASSWORD="$${ASCENDER_DB_PASSWORD:-unused}" $(COMPOSE)

# Per-machine settings (ASCENDER_MODE, ports, cookie names, host
# directories) go in .env at the repository root, as plain KEY=value lines
# (git- and docker-ignored; .env.example lists them). They reach make, the
# processes run-web and run-task start, and docker compose. A variable set
# on the command line or in the environment wins over the file. Secrets
# stay in .secrets/ (below), not in .env.
ENV_FILE ?= $(CURDIR)/.env
ifneq ($(wildcard $(ENV_FILE)),)
ENV_VARS := $(shell sed -n 's/^[[:space:]]*\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' '$(ENV_FILE)')
$(foreach v,$(ENV_VARS),$(if $(filter environment command,$(firstword $(origin $(v)))),,$(eval $(v) := $(shell sed -n 's/^[[:space:]]*$(v)=//p' '$(ENV_FILE)' | tail -n 1))))
ifneq ($(strip $(ENV_VARS)),)
export $(ENV_VARS)
endif
endif

# Local secrets, used when present (never committed; .dockerignore keeps
# them out of image builds).
SECRETS_DIR            ?= $(CURDIR)/.secrets
# A new checkout gets its secrets generated (scripts/init-secrets.sh) by the
# first target that needs them, when neither is configured anywhere: done
# here, before they are read, rather than in a prerequisite, which would
# run after.
SECRETS_GOALS := start restart images run-web run-task migrate perf-seed
ifneq ($(filter $(SECRETS_GOALS),$(MAKECMDGOALS)),)
ifeq ($(origin SECRET_KEY_FILE)$(strip $(ASCENDER_DB_PASSWORD)),undefined)
$(shell sh '$(CURDIR)/scripts/init-secrets.sh' '$(SECRETS_DIR)' '$(firstword $(COMPOSE_CMD))')
endif
endif
SECRET_KEY_FILE        ?= $(wildcard $(SECRETS_DIR)/SECRET_KEY)
ADMIN_PASSWORD_FILE    ?= $(wildcard $(SECRETS_DIR)/ADMIN_PASSWORD)
ifeq ($(strip $(ASCENDER_DB_PASSWORD)),)
ifneq ($(wildcard $(SECRETS_DIR)/ASCENDER_DB_PASSWORD),)
ASCENDER_DB_PASSWORD   := $(shell tr -d '\r\n' < '$(SECRETS_DIR)/ASCENDER_DB_PASSWORD')
endif
endif
export ASCENDER_DB_PASSWORD

# Local development defaults (see deploy/README.md); override on the
# command line or in the environment.
ASCENDER_DB_NAME       ?= ascender
ASCENDER_DB_USER       ?= ascender
# The compose file's postgres container publishes its port here.
ASCENDER_DB_LOCAL_PORT ?= 5442
# The processes run on the host reach the compose database through these;
# the binaries assemble (and escape) the URL themselves, and the password
# stays in the exported environment, never on a command line or in make's
# output. An ASCENDER_DATABASE_URL in the environment takes precedence.
DB_ENV = ASCENDER_DB_HOST=localhost ASCENDER_DB_PORT='$(ASCENDER_DB_LOCAL_PORT)' ASCENDER_DB_NAME='$(ASCENDER_DB_NAME)' ASCENDER_DB_USER='$(ASCENDER_DB_USER)' ASCENDER_DB_SSLMODE=disable
ASCENDER_LISTEN        ?= :8070
ASCENDER_PROJECTS_ROOT ?= /var/lib/ascender/projects
ASCENDER_JOBOUTPUT_ROOT ?= /var/lib/ascender/job_status
ASCENDER_CONTAINER_RUNTIME ?= docker
# Host directories the task container bind-mounts (project checkouts,
# shared with the web container, and job private data). The container runs
# as uid 1000, so they must be its; `start` and `restart` create them so, and
# give back anything in them another user wrote (a task process once run as
# root). docker would otherwise create a missing one as root.
ASCENDER_PROJECTS_DIR    ?= /var/lib/ascender/projects
ASCENDER_JOB_PRIVATE_DIR ?= /var/lib/ascender/job_private
TASK_UID                 ?= 1000
export ASCENDER_PROJECTS_DIR ASCENDER_JOB_PRIVATE_DIR
export SECRET_KEY_FILE ADMIN_PASSWORD_FILE

SERVICES ?=

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^##@/ {printf "\n%s\n", substr($$0, 5)} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

##@ Go

.PHONY: build
build: $(addprefix build-,$(COMMANDS)) ## Build both binaries into bin/

.PHONY: build-%
build-%:
	cd $(SRC) && CGO_ENABLED=0 go build -trimpath -o $(BIN)/$* ./cmd/$*

.PHONY: fmt
fmt: ## gofmt the source tree
	gofmt -w $(SRC)/internal $(SRC)/cmd $(SRC)/web

.PHONY: fmt-templates
fmt-templates: ## Lay out the UI templates on indented lines (see src/internal/tmplws)
	cd $(SRC) && go run ./internal/tmplws/tmplfmt -w web/templates

.PHONY: fmt-json
fmt-json: ## Pretty-print the API's JSON (metadata, locale) with scripts/prettyjson.py
	python3 -I scripts/prettyjson.py $(SRC)/internal/api >/dev/null

.PHONY: fmt-docsite
fmt-docsite: ## Lay out the tables of the documentation site's pages (docs/docsite)
	cd $(SRC) && go run ./cmd/ascender-docsite fmt -src ../docs/docsite >/dev/null

.PHONY: vet
vet: ## go vet ./...
	cd $(SRC) && go vet ./...

# Pinned so results don't drift; go run fetches them once into the module
# cache. staticcheck reads src/staticcheck.conf.
STATICCHECK := honnef.co/go/tools/cmd/staticcheck@2026.2.2
DEADCODE    := golang.org/x/tools/cmd/deadcode@v0.52.0
GOVULNCHECK := golang.org/x/vuln/cmd/govulncheck@v1.9.0

.PHONY: lint
lint: ## staticcheck, and deadcode (functions no binary can reach)
	cd $(SRC) && go run $(STATICCHECK) ./...
	@cd $(SRC) && out="$$(go run $(DEADCODE) ./...)" && { [ -z "$$out" ] || { echo "$$out"; echo "unreachable functions: delete them, or move test-only helpers into _test.go files" >&2; exit 1; }; }

.PHONY: vulncheck
vulncheck: ## govulncheck: known vulnerabilities the binaries can reach (modules and standard library)
	cd $(SRC) && go run $(GOVULNCHECK) ./...

.PHONY: test
test: ## go test ./... (GOTESTFLAGS=-race adds flags)
	cd $(SRC) && go test $(GOTESTFLAGS) ./...

.PHONY: check
check: fmt fmt-templates fmt-json fmt-docsite licenses build vet docsite-check ## gofmt, layouts, Go module licenses, build, vet and the docs site's links (run before finishing a change)

# CI runs these: they report rather than rewrite.
.PHONY: fmt-check
fmt-check: ## Fail if any file needs gofmt, a template or docs table laying out, or API JSON pretty-printing
	@out="$$(gofmt -l $(SRC)/internal $(SRC)/cmd $(SRC)/web)"; [ -z "$$out" ] || { echo "$$out"; echo "these files need gofmt: run make fmt" >&2; exit 1; }
	@cd $(SRC) && go run ./internal/tmplws/tmplfmt -l web/templates || { echo "these templates need laying out: run make fmt-templates" >&2; exit 1; }
	@python3 -I scripts/prettyjson.py --check $(SRC)/internal/api || { echo "these JSON files need pretty-printing: run make fmt-json" >&2; exit 1; }
	@cd $(SRC) && go run ./cmd/ascender-docsite fmt -src ../docs/docsite -check || { echo "these pages' tables need laying out: run make fmt-docsite" >&2; exit 1; }

.PHONY: licenses
licenses: ## Write licenses/go: the license of every Go module the binaries link (scripts/golicenses.py)
	python3 -I scripts/golicenses.py

.PHONY: licenses-check
licenses-check: ## Fail if licenses/go does not match the Go modules the binaries link
	python3 -I scripts/golicenses.py --check

.PHONY: tidy-check
tidy-check: ## Fail if go.mod or go.sum needs go mod tidy
	cd $(SRC) && go mod tidy -diff

# The hook only calls pre-commit.sh, so the checks follow the checkout. A
# hook of another's is left alone; the marker line tells ours apart.
.PHONY: hooks
hooks: ## Install the git pre-commit hook, which runs pre-commit.sh
	@hook="$$(git rev-parse --git-path hooks/pre-commit 2>/dev/null)" || { echo "hooks: not a git checkout, no hook installed"; exit 0; }; \
	if [ -e "$$hook" ] && ! grep -q '^# ascender pre-commit.sh' "$$hook"; then \
		echo "hooks: $$hook is not ours, left as it is: call ./pre-commit.sh from it for the checks"; exit 0; \
	fi; \
	mkdir -p "$$(dirname "$$hook")" && \
	printf '%s\n' '#!/bin/sh' '# ascender pre-commit.sh: installed by make hooks' \
		'top=$$(git rev-parse --show-toplevel) || exit 1' \
		'[ ! -x "$$top/pre-commit.sh" ] || exec "$$top/pre-commit.sh"' >"$$hook" && \
	chmod +x "$$hook" && echo "hooks: installed $$hook (runs pre-commit.sh)"

.PHONY: upgrade
upgrade: ## Update all dependencies (go get -u) and go mod tidy
	cd $(SRC) && go get -u -t ./... && go mod tidy

.PHONY: tidy
tidy: ## go mod tidy
	cd $(SRC) && go mod tidy

.PHONY: i18n-missing
i18n-missing: ## List UI messages the code uses that a catalog does not translate (LANG_CODE=ja, or ALL=1)
	cd $(SRC) && go run ./internal/i18n/missing $(if $(ALL),-all,-lang $(or $(LANG_CODE),ja))

.PHONY: i18n-import
i18n-import: ## Merge the old UI's .po translations into the JSON catalogs (OLD=<ascender checkout>)
	$(if $(OLD),,$(error set OLD to a checkout of github.com/ctrliq/ascender))
	cd $(SRC) && go run ./internal/i18n/importpo -merge -old '$(OLD)'

.PHONY: clean
clean: ## Remove bin/
	rm -rf $(BIN)

##@ Documentation site

DOCSITE_LISTEN ?= 127.0.0.1:8090
DOCSITE_BASE   ?= /

.PHONY: docsite
docsite: ## Build the documentation site (docs/docsite) as static files in bin/docsite (DOCSITE_BASE=/ is its URL path)
	cd $(SRC) && go run ./cmd/ascender-docsite build -src ../docs/docsite -base '$(DOCSITE_BASE)' -out $(BIN)/docsite

.PHONY: docsite-serve
docsite-serve: ## Serve the documentation site on http://127.0.0.1:8090/ (DOCSITE_LISTEN), read again on every page load
	cd $(SRC) && go run ./cmd/ascender-docsite serve -src ../docs/docsite -static web/static -listen '$(DOCSITE_LISTEN)'

.PHONY: docsite-check
docsite-check: ## Fail on broken links, missing titles or unused images in the documentation site
	cd $(SRC) && go run ./cmd/ascender-docsite check -src ../docs/docsite

##@ Run on the host

.PHONY: run-web
run-web: require-db-password require-secret-key ## Run the web server from source, templates served from disk
	cd $(SRC) && $(DB_ENV) \
	ASCENDER_SECRET_KEY_FILE='$(SECRET_KEY_FILE)' \
	ASCENDER_ADMIN_PASSWORD_FILE='$(ADMIN_PASSWORD_FILE)' \
	ASCENDER_LISTEN='$(ASCENDER_LISTEN)' ASCENDER_PROJECTS_ROOT='$(ASCENDER_PROJECTS_ROOT)' \
	ASCENDER_STATIC_DIR=web/static ASCENDER_TEMPLATE_DIR=web/templates \
	ASCENDER_DOCS_DIR=../docs/docsite \
	go run ./cmd/ascender-web

.PHONY: migrate
migrate: require-db-password require-secret-key ## Apply the supplemental schema migrations (indexes) and list them
	cd $(SRC) && $(DB_ENV) \
	ASCENDER_SECRET_KEY_FILE='$(SECRET_KEY_FILE)' \
	go run ./cmd/ascender-web migrate

.PHONY: perf-seed
perf-seed: require-db-password ## Load scale test data into a *_perf copy of the database (ASCENDER_DB_NAME=ascender_perf)
	cd $(SRC) && $(DB_ENV) go run ./cmd/zz-perfseed

.PHONY: run-task
run-task: require-db-password require-secret-key ## Run the task process from source
	cd $(SRC) && $(DB_ENV) \
	ASCENDER_SECRET_KEY_FILE='$(SECRET_KEY_FILE)' \
	ASCENDER_ADMIN_PASSWORD_FILE='$(ADMIN_PASSWORD_FILE)' \
	ASCENDER_PROJECTS_ROOT='$(ASCENDER_PROJECTS_ROOT)' ASCENDER_JOBOUTPUT_ROOT='$(ASCENDER_JOBOUTPUT_ROOT)' \
	ASCENDER_CONTAINER_RUNTIME='$(ASCENDER_CONTAINER_RUNTIME)' \
	go run ./cmd/ascender-task

##@ Docker (deploy/docker-compose.yml; SERVICES=web or task limits to one)

.PHONY: init
init: ## Prepare this host: install compose and Go if missing, generate the secrets and .env, install the git hook
	@sh scripts/init.sh '$(SECRETS_DIR)' '$(ENV_FILE)'
	@$(MAKE) -s hooks

.PHONY: start
start: require-db-password require-secret-key host-dirs ## Build the images and start the containers
	$(COMPOSE) up -d --build $(SERVICES)

.PHONY: stop
stop: ## Stop and remove the containers (volumes are kept)
	@# Compose warns "No resource found to remove" when there's nothing up.
	@# docker compose lists stopped containers only with -a; podman-compose
	@# has no -a and always lists them. A failing ps (daemon down, bad
	@# compose file) fails the target.
	@ids="$$($(COMPOSE_ANY) ps -a -q 2>/dev/null)" || ids="$$($(COMPOSE_ANY) ps -q)" || exit $$?; \
	if [ -n "$$ids" ]; then \
		echo '$(COMPOSE) down'; $(COMPOSE_ANY) down; \
	else \
		echo 'No containers to stop.'; \
	fi

.PHONY: restart
restart: require-db-password require-secret-key host-dirs ## Rebuild and recreate the containers
	$(COMPOSE) up -d --build --force-recreate $(SERVICES)

.PHONY: images
images: require-db-password require-secret-key ## Build the images without starting them
	$(COMPOSE) build $(SERVICES)

.PHONY: logs
logs: ## Follow the containers' logs
	$(COMPOSE_ANY) logs -f $(SERVICES)

.PHONY: ps
ps: ## Show the containers' status
	$(COMPOSE_ANY) ps

.PHONY: require-db-password
require-db-password:
	@test -n "$$ASCENDER_DB_PASSWORD" || { echo "ASCENDER_DB_PASSWORD is not set: put it in .secrets/ASCENDER_DB_PASSWORD or the environment; it is generated only together with SECRET_KEY, for a new installation (see deploy/README.md)" >&2; exit 1; }

.PHONY: host-dirs
host-dirs: ## Create the task container's host directories, owned by its uid
	@for d in '$(ASCENDER_PROJECTS_DIR)' '$(ASCENDER_JOB_PRIVATE_DIR)'; do \
		case "$$d" in /*) ;; *) echo "refusing directory '$$d': give an absolute path" >&2; exit 1;; esac; \
		d="$${d%/}"; \
		case "$$d" in *..*) echo "refusing directory '$$d'" >&2; exit 1;; esac; \
		if [ "$$(printf %s "$$d" | tr -cd / | wc -c)" -lt 2 ]; then echo "refusing directory '$$d': give one of its own, such as /var/lib/ascender/projects" >&2; exit 1; fi; \
		case "$$d" in /home/*/*) ;; /usr/*|/etc/*|/boot/*|/proc/*|/sys/*|/dev/*|/run/*|/root/*|/home/*|/var/lib|/var/log|/var/cache|/var/spool|/var/tmp) echo "refusing directory '$$d': a system directory" >&2; exit 1;; esac; \
		mkdir -p "$$d" || exit 1; \
		if [ -n "$$(find "$$d" ! -uid '$(TASK_UID)' -print -quit)" ]; then \
			if chown -R '$(TASK_UID):0' "$$d"; then echo "$$d now belongs to uid $(TASK_UID)"; \
			else echo "$$d must belong to uid $(TASK_UID), the task container's user: chown -R $(TASK_UID):0 $$d" >&2; exit 1; fi; \
		fi; \
	done

.PHONY: require-secret-key
require-secret-key:
	@test -n "$(SECRET_KEY_FILE)" -a -r "$(SECRET_KEY_FILE)" || { echo "No SECRET_KEY: put it in .secrets/SECRET_KEY or set SECRET_KEY_FILE; it is generated only together with the database password, for a new installation (see deploy/README.md)" >&2; exit 1; }
