-- The netbox inventory source (internal/netbox): Ascender reads the NetBox
-- REST API itself, on the control plane.
--
-- source_sync_state is the source's bookkeeping: the NetBox changelog
-- position and skip streak of its incremental sync, and the webhook burst
-- waiting to settle. The task process writes it directly, outside the
-- activity stream, as it writes managed_inventory_variables.
ALTER TABLE IF EXISTS main_inventorysource ADD COLUMN IF NOT EXISTS source_sync_state jsonb NOT NULL DEFAULT '{}'::jsonb;
-- The NetBox credential type is a managed type like the others the baseline
-- carries: the row names it, and internal/models/managed_credential_types.json
-- holds its fields. A database that already has one (upgraded from a build
-- of the old application that had the source) keeps its row.
INSERT INTO main_credentialtype (created, modified, description, name, kind, managed, inputs, injectors, created_by_id, modified_by_id, namespace)
SELECT now(), now(), '', 'NetBox', 'cloud', true, '{}', '{}', NULL, NULL, 'netbox'
WHERE NOT EXISTS (SELECT 1 FROM main_credentialtype WHERE namespace = 'netbox');
