-- ascender: optional
-- ?search= on hosts and jobs is UPPER(col) LIKE UPPER('%term%'), which no
-- b-tree can serve. Trigram indexes on the same expressions can. pg_trgm is
-- a trusted extension (PostgreSQL 13+): the database owner may create it.
-- Where it cannot be created this migration is skipped and tried again at
-- the next start; nothing depends on it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_host_name_trgm
    ON main_host USING gin (upper(name) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_host_description_trgm
    ON main_host USING gin (upper(description) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_uj_name_trgm
    ON main_unifiedjob USING gin (upper(name) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_uj_description_trgm
    ON main_unifiedjob USING gin (upper(description) gin_trgm_ops);
