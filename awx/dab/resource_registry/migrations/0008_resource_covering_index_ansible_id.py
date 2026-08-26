from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("dab_resource_registry", "0007_alter_resource_ansible_id_and_more"),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="resource",
            name="dab_resourc_content_6d9d9c_idx",
        ),
        migrations.AlterUniqueTogether(
            name="resource",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="resource",
            constraint=models.UniqueConstraint(
                fields=("content_type", "object_id"),
                include=("ansible_id",),
                name="unique_resource_content_type_object_id",
            ),
        ),
    ]
