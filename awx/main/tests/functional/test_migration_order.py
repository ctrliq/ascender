from django.db.migrations.executor import MigrationExecutor


def test_token_checksum_column_is_added_before_oauth2_provider_fills_it():
    """
    oauth2_provider 0012 saves every existing access token with update_fields=['token_checksum'] on the swapped
    model, so main 0198, which adds that column, has to run first. Plan a plain `migrate` for a database at the
    state of a 25.4.0 install and check the order it would use. Applied in the other order, a database that has
    access tokens fails with ValueError: 'token_checksum' does not exist in this model.
    """
    executor = MigrationExecutor(None)
    graph = executor.loader.graph
    applied = set(graph.forwards_plan(('main', '0197_add_federated_inventory_kind')))
    applied |= set(graph.forwards_plan(('oauth2_provider', '0005_auto_20211222_2352')))
    executor.loader.applied_migrations = {node: None for node in applied}
    plan = [migration.app_label + '.' + migration.name for migration, backwards in executor.migration_plan(graph.leaf_nodes())]
    assert plan.index('main.0198_oauth2accesstoken_token_checksum_and_more') < plan.index('oauth2_provider.0012_add_token_checksum')
