-- The NetBox credential type, for the netbox inventory source (the
-- netbox.netbox.nb_inventory plugin). It is a managed type like the ones the
-- baseline carries: the row names it, with empty inputs and injectors, and
-- internal/models/managed_credential_types.json holds its fields and
-- injectors.
--
-- A custom credential type already called NetBox, of kind cloud, holds the
-- (name, kind) the row needs. It cannot simply be deleted (its credentials
-- would go with it), so it is renamed "NetBox (custom <id>)" and keeps its
-- fields and credentials; the id keeps the new name unique.
UPDATE main_credentialtype SET name = 'NetBox (custom ' || id || ')', modified = now()
WHERE name = 'NetBox' AND kind = 'cloud' AND namespace IS DISTINCT FROM 'netbox';
-- A row that already has the namespace (a build that carried a NetBox source
-- of its own) becomes this one in place, so its credentials, whose fields
-- have the same ids, keep working.
UPDATE main_credentialtype SET name = 'NetBox', kind = 'cloud', managed = true, inputs = '{}', injectors = '{}', modified = now()
WHERE namespace = 'netbox' AND (name, kind, managed, inputs, injectors) IS DISTINCT FROM ('NetBox', 'cloud', true, '{}'::jsonb, '{}'::jsonb);
INSERT INTO main_credentialtype (created, modified, description, name, kind, managed, inputs, injectors, created_by_id, modified_by_id, namespace)
SELECT now(), now(), '', 'NetBox', 'cloud', true, '{}', '{}', NULL, NULL, 'netbox'
WHERE NOT EXISTS (SELECT 1 FROM main_credentialtype WHERE namespace = 'netbox');
