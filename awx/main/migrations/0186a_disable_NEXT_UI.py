# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('main', '0186_drop_django_taggit'),
    ]

    operations = [
        migrations.RunSQL("UPDATE conf_setting SET value='false' WHERE key='UI_NEXT'; INSERT INTO conf_setting (created, modified, key, value) SELECT NOW(), NOW(), 'UI_NEXT', 'false' WHERE NOT EXISTS (SELECT 1 FROM conf_setting WHERE key='UI_NEXT');")
    ]
