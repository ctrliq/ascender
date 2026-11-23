-- What a new database gets besides the baseline: the rows that belong to one
-- installation, which a dump must not carry from one to the next, and the
-- rows the Django application created the first time it needed them rather
-- than in a migration. Written by hand; run once, in the baseline's
-- transaction.

-- Role.singleton(): the two system roles, each its own ancestor.
INSERT INTO public.main_rbac_roles (role_field, singleton_name, implicit_parents)
VALUES ('system_administrator', 'system_administrator', '[]'), ('system_auditor', 'system_auditor', '[]');
INSERT INTO public.main_rbac_role_ancestors (role_field, content_type_id, object_id, ancestor_id, descendent_id)
SELECT role_field, 0, 0, id, id FROM public.main_rbac_roles WHERE singleton_name IS NOT NULL;

-- Migrations 0069 (a unique INSTALL_UUID) and conf.0009 (UI_NEXT).
INSERT INTO public.conf_setting (created, modified, key, value, user_id)
VALUES (now(), now(), 'INSTALL_UUID', to_jsonb(gen_random_uuid()::text), NULL), (now(), now(), 'UI_NEXT', 'false', NULL);

-- The resource registry's id for this service.
INSERT INTO public.dab_resource_registry_serviceid (id) VALUES (gen_random_uuid());
