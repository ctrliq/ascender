# Sourced by run-postgresql from ${APP_DATA}/src/postgresql-start on every
# container start, after the server is up. See process_extending_files in the
# sclorg container scripts: a directory mounted here wins over the image's own
# start/ directory, and the files are sourced rather than executed.
#
# The suite builds its own database (test_ascender_pg, plus a test_ascender_pg_gwN per
# worker under xdist), which the application role cannot do: the image creates
# POSTGRESQL_USER without CREATEDB. Granting it here means a fresh development
# environment can run `make test` without anyone first discovering the failure
# and applying the grant by hand.
#
# ALTER ROLE is idempotent, so re-running it on every start costs nothing, and
# an environment whose volume predates this file picks the grant up on its next
# restart rather than needing to be recreated.
if [ -v POSTGRESQL_USER ]; then
    psql --set ON_ERROR_STOP=1 --set=username="$POSTGRESQL_USER" \
        <<< 'ALTER ROLE :"username" CREATEDB;'
fi
