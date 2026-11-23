-- A NetBox event rule can post to an inventory source, which marks it for a
-- sync once the burst of webhooks settles (internal/netbox, Burst; the
-- receiver is in internal/api/inventory_source_webhooks.go). webhook_service
-- names the one service an inventory source accepts, netbox, and
-- webhook_key is the secret NetBox signs the body with, as job templates,
-- workflow job templates and projects have them. A database upgraded from a
-- build of the old application that had the source keeps its columns.
ALTER TABLE IF EXISTS main_inventorysource ADD COLUMN IF NOT EXISTS webhook_service varchar(16) NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS main_inventorysource ADD COLUMN IF NOT EXISTS webhook_key varchar(64) NOT NULL DEFAULT '';
