-- jobs_total and the running counts of the instance list and detail.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_uj_execution_node
    ON main_unifiedjob (execution_node);
