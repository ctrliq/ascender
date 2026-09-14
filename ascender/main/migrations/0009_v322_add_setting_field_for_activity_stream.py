# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations

import ascender.main.fields


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0008_v320_drop_v1_credential_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='activitystream',
            name='setting',
            field=ascender.main.fields.JSONBlob(default=dict, blank=True),
        ),
    ]
