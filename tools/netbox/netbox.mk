# NetBox, for the netbox inventory source (README.md in this directory).
# Included by tools/Makefile.

NETBOX_DIR     := $(TOOLS_DIR)/netbox
NETBOX_COMPOSE  = $(COMPOSE_BIN) -f '$(NETBOX_DIR)/compose.yml'
NETBOX_EE_IMAGE ?= localhost/ascender-ee-netbox:dev

##@ NetBox (netbox/: the netbox inventory source)

.PHONY: netbox-start
netbox-start: require-network ## Start NetBox (http://netbox:8080 from the containers, localhost:NETBOX_PORT, 8000, from here)
	$(NETBOX_COMPOSE) up -d

.PHONY: netbox-stop
netbox-stop: ## Stop and remove the NetBox containers (its database volume is kept)
	$(NETBOX_COMPOSE) down

.PHONY: netbox-logs
netbox-logs: ## Follow NetBox's logs
	$(NETBOX_COMPOSE) logs -f

.PHONY: netbox-seed
netbox-seed: ## Fill NetBox with an estate to sync (SEED_ARGS=--scale 2000 adds devices)
	python3 -I '$(NETBOX_DIR)/seed.py' --url 'http://localhost:$(or $(NETBOX_PORT),8000)' $(SEED_ARGS)

.PHONY: netbox-ee
netbox-ee: ## Build an execution environment with netbox.netbox and load it into the task container (NETBOX_EE_IMAGE)
	$(ENGINE) build -t '$(NETBOX_EE_IMAGE)' -f '$(NETBOX_DIR)/ee/Containerfile' '$(NETBOX_DIR)/ee'
	$(ENGINE) save '$(NETBOX_EE_IMAGE)' | $(ENGINE) exec -i '$(TASK_CONTAINER)' podman load
