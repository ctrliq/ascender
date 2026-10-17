# Copyright (c) 2026 Ascender
# All Rights Reserved.

from django.core.management.base import BaseCommand

from ascender.main.utils.workload_identity import rotate_signing_key


class Command(BaseCommand):
    """
    Start signing workload identity tokens with a new key.

    The key in use until now stays published, so the tokens it signed keep
    validating until they run out; the ones before it are dropped. Running it
    twice, a token lifetime apart, retires a key completely.
    """

    help = 'Start signing workload identity tokens with a new key, keeping the previous one published.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--keep',
            type=int,
            default=1,
            help='How many of the previous keys stay published (default 1). 0 drops them all at once, which invalidates every token already issued.',
        )

    def handle(self, *args, **options):
        new, dropped = rotate_signing_key(keep=max(options['keep'], 0))
        self.stdout.write(f'Signing with {new.kid}')
        for kid in dropped:
            self.stdout.write(f'Dropped {kid}')
