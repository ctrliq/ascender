-- The NetBox credential type, for the netbox inventory source (the
-- netbox.netbox.nb_inventory plugin). It is a managed type like the ones the
-- baseline carries: the row names it, with empty inputs and injectors, and
-- internal/models/managed_credential_types.json holds its fields and
-- injectors.
--
-- A custom credential type already called NetBox, of kind cloud, holds the
-- (name, kind) the row needs. It cannot simply be deleted (its credentials
-- would go with it), so it is renamed "NetBox (custom <id>)" and keeps its
-- fields and credentials. Should another cloud type already have that name,
-- it becomes "NetBox (custom <id>, 2)", or the first number after that
-- which is free.
UPDATE main_credentialtype t SET name = (
    SELECT c.name FROM (
        SELECT n, 'NetBox (custom ' || t.id || CASE WHEN n = 1 THEN '' ELSE ', ' || n END || ')' AS name
        FROM generate_series(1, 1000) n
    ) c
    WHERE NOT EXISTS (SELECT 1 FROM main_credentialtype o WHERE o.kind = t.kind AND o.name = c.name)
    ORDER BY c.n LIMIT 1
), modified = now()
WHERE t.name = 'NetBox' AND t.kind = 'cloud' AND t.namespace IS DISTINCT FROM 'netbox';
-- A row that already has the namespace (a build that carried a NetBox source
-- of its own) becomes this one in place, so its credentials, whose fields
-- have the same ids, keep working.
UPDATE main_credentialtype SET name = 'NetBox', kind = 'cloud', managed = true, inputs = '{}', injectors = '{}', modified = now()
WHERE namespace = 'netbox' AND (name, kind, managed, inputs, injectors) IS DISTINCT FROM ('NetBox', 'cloud', true, '{}'::jsonb, '{}'::jsonb);
INSERT INTO main_credentialtype (created, modified, description, name, kind, managed, inputs, injectors, created_by_id, modified_by_id, namespace)
SELECT now(), now(), '', 'NetBox', 'cloud', true, '{}', '{}', NULL, NULL, 'netbox'
WHERE NOT EXISTS (SELECT 1 FROM main_credentialtype WHERE namespace = 'netbox');
