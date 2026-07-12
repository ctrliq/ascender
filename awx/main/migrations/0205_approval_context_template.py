from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0204_job_slice_pinned_hosts'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowapprovaltemplate',
            name='context_template',
            field=models.TextField(
                blank=True,
                default='',
                help_text=(
                    "A Jinja2 template rendered with upstream set_stats artifacts when the approval is created. "
                    "The result is stored on the approval as context_message and shown to the approver."
                ),
            ),
        ),
        migrations.AddField(
            model_name='workflowapproval',
            name='context_message',
            field=models.TextField(
                blank=True,
                default='',
                help_text=(
                    "The rendered context from the approval template's context_template, "
                    "populated with upstream set_stats artifacts when the approval is created."
                ),
            ),
        ),
    ]
