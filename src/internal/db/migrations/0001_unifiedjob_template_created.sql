-- The ten most recent jobs of each template (recent_jobs on every template
-- list) read every job of the template without this.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ascender_uj_template_created
    ON main_unifiedjob (unified_job_template_id, created DESC, id DESC);
