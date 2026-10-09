import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0225_jobtemplate_prevent_relaunch"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="workflowjob",
            name="allow_force_node_success_on_relaunch",
            field=models.BooleanField(
                default=False,
                help_text="Allow a relaunch from failed nodes to carry chosen failed nodes forward as though they had succeeded, so the workflow continues down their success paths. Each forced node records who forced it and why.",
            ),
        ),
        migrations.AddField(
            model_name="workflowjobnode",
            name="forced_success",
            field=models.BooleanField(
                default=False,
                editable=False,
                help_text="Set when a workflow is relaunched from a failed node and this node was forced as successful: its job failed in the prior run, but whoever relaunched it chose to carry it forward as though it had succeeded. Such a node also has prior_run_succeeded set.",
            ),
        ),
        migrations.AddField(
            model_name="workflowjobnode",
            name="forced_success_by",
            field=models.ForeignKey(
                blank=True,
                default=None,
                editable=False,
                help_text="The user who forced the node as successful.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="workflowjobnode",
            name="forced_success_job",
            field=models.ForeignKey(
                blank=True,
                default=None,
                editable=False,
                help_text="The failed job whose outcome was overridden when the node was forced as successful.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="main.unifiedjob",
            ),
        ),
        migrations.AddField(
            model_name="workflowjobnode",
            name="forced_success_reason",
            field=models.TextField(
                blank=True,
                default="",
                editable=False,
                help_text="Why the node was forced as successful, as given by whoever relaunched the workflow.",
            ),
        ),
        migrations.AddField(
            model_name="workflowjobtemplate",
            name="allow_force_node_success_on_relaunch",
            field=models.BooleanField(
                default=False,
                help_text="Allow a relaunch from failed nodes to carry chosen failed nodes forward as though they had succeeded, so the workflow continues down their success paths. Each forced node records who forced it and why.",
            ),
        ),
    ]
