import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0202_project_webhooks'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowjobtemplatenode',
            name='max_retries',
            field=models.PositiveIntegerField(
                default=0,
                validators=[django.core.validators.MaxValueValidator(100)],
                help_text=(
                    "Maximum number of times this node's job is automatically retried after "
                    "failing before its failure paths are followed. Canceled jobs are never retried."
                ),
            ),
        ),
        migrations.AddField(
            model_name='workflowjobnode',
            name='max_retries',
            field=models.PositiveIntegerField(
                default=0,
                validators=[django.core.validators.MaxValueValidator(100)],
                help_text=(
                    "Maximum number of times this node's job is automatically retried after "
                    "failing before its failure paths are followed. Canceled jobs are never retried."
                ),
            ),
        ),
        migrations.AddField(
            model_name='workflowjobnode',
            name='retry_attempts',
            field=models.PositiveIntegerField(
                default=0,
                editable=False,
                help_text="Number of times this node's job has been automatically retried after failing.",
            ),
        ),
        migrations.AddField(
            model_name='workflowjobnode',
            name='retried_jobs',
            field=models.ManyToManyField(
                blank=True,
                editable=False,
                help_text='Jobs from earlier attempts of this node that were superseded by an automatic retry.',
                related_name='retried_workflow_nodes',
                to='main.unifiedjob',
            ),
        ),
    ]
