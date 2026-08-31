from django.core.management.base import BaseCommand

from awx.dab.resource_registry.apps import initialize_resources


class Command(BaseCommand):
    help = (
        "Populate the resource registry (ResourceType and Resource records) for all registered models. "
        "This normally happens automatically during migrations; use this command to repair a registry "
        "that is missing entries. Safe to run multiple times."
    )

    def handle(self, *args, **options):
        self.stdout.write("Initializing resource registry...")
        initialize_resources(sender=None, force=True)
        self.stdout.write("Resource registry initialization complete.")
