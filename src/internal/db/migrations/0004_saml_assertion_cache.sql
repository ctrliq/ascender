-- SAML assertions already accepted, until they expire: an assertion signs
-- one login, and every web process (and a restarted one) must refuse it a
-- second time, not only the process that took it. Rows past expires are
-- deleted as new ones arrive, which the index on expires keeps from
-- reading the whole table at every login.
CREATE TABLE IF NOT EXISTS ascender_saml_assertion (
    id text PRIMARY KEY,
    expires timestamptz NOT NULL
);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_saml_assertion_expires
    ON ascender_saml_assertion (expires);
