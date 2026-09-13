# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
``awx-manage check_settings``: does every registered setting accept its own default?
"""

from django.core.management.base import BaseCommand, CommandError

from awx.conf.validation import invalid_setting_defaults


class Command(BaseCommand):
    """Check the settings registry for defaults their own fields refuse."""

    help = 'Check that every registered setting has a default its declared field accepts.'

    def handle(self, *args, **options):
        """
        Validate the registry and report.

        Raises:
            CommandError: when any registered setting has a default its field
                refuses, so this fails a pipeline rather than only printing.
        """
        problems = invalid_setting_defaults()
        if problems:
            raise CommandError('{} setting(s) have a default their own field refuses:\n  {}'.format(len(problems), '\n  '.join(problems)))
        self.stdout.write('Every registered setting has a default its field accepts.')
