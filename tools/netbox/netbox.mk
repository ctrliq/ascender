# NetBox, for the netbox inventory source (README.md in this directory).
# Included by tools/Makefile.

NETBOX_DIR     := $(TOOLS_DIR)/netbox
NETBOX_COMPOSE  = $(COMPOSE_BIN) -f '$(NETBOX_DIR)/compose.yml'
NETBOX_EE_IMAGE ?= localhost/ascender-ee-netbox:dev
# Where this host reaches NetBox: the address it is published on
# (NETBOX_BIND), or localhost when that is every address or the loopback
# one. An IPv6 address goes in brackets.
NETBOX_HOST = $(if $(filter-out 0.0.0.0 :: 127.0.0.1 ::1,$(strip $(NETBOX_BIND))),$(strip $(NETBOX_BIND)),localhost)
NETBOX_URL ?= http://$(if $(findstring :,$(NETBOX_HOST)),[$(NETBOX_HOST)],$(NETBOX_HOST)):$(or $(NETBOX_PORT),8000)

##@ NetBox (netbox/: the netbox inventory source)

.PHONY: netbox-start
netbox-start: require-network ## Start NetBox (http://netbox:8080 from the containers, NETBOX_URL from here)
	$(NETBOX_COMPOSE) up -d

.PHONY: netbox-stop
netbox-stop: ## Stop and remove the NetBox containers (its database volume is kept)
	$(NETBOX_COMPOSE) down

.PHONY: netbox-logs
netbox-logs: ## Follow NetBox's logs
	$(NETBOX_COMPOSE) logs -f

.PHONY: netbox-seed
netbox-seed: ## Fill NetBox with an estate to sync (SEED_ARGS=--scale 2000 adds devices)
	python3 -I '$(NETBOX_DIR)/seed.py' --url '$(NETBOX_URL)' $(SEED_ARGS)

.PHONY: netbox-ee
netbox-ee: ## Build an execution environment with netbox.netbox and load it into the task container (NETBOX_EE_IMAGE)
	$(ENGINE) build -t '$(NETBOX_EE_IMAGE)' -f '$(NETBOX_DIR)/ee/Containerfile' '$(NETBOX_DIR)/ee'
	$(ENGINE) save '$(NETBOX_EE_IMAGE)' | $(ENGINE) exec -i '$(TASK_CONTAINER)' podman load
