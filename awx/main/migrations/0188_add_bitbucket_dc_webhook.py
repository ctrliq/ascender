# Generated by Django 4.2.6 on 2023-11-16 21:00

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0187a_mountain_credential'),
    ]

    operations = [
        migrations.AlterField(
            model_name='job',
            name='webhook_service',
            field=models.CharField(
                blank=True,
                choices=[('github', 'GitHub'), ('gitlab', 'GitLab'), ('bitbucket_dc', 'BitBucket DataCenter')],
                help_text='Service that webhook requests will be accepted from',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='jobtemplate',
            name='webhook_service',
            field=models.CharField(
                blank=True,
                choices=[('github', 'GitHub'), ('gitlab', 'GitLab'), ('bitbucket_dc', 'BitBucket DataCenter')],
                help_text='Service that webhook requests will be accepted from',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='workflowjob',
            name='webhook_service',
            field=models.CharField(
                blank=True,
                choices=[('github', 'GitHub'), ('gitlab', 'GitLab'), ('bitbucket_dc', 'BitBucket DataCenter')],
                help_text='Service that webhook requests will be accepted from',
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name='workflowjobtemplate',
            name='webhook_service',
            field=models.CharField(
                blank=True,
                choices=[('github', 'GitHub'), ('gitlab', 'GitLab'), ('bitbucket_dc', 'BitBucket DataCenter')],
                help_text='Service that webhook requests will be accepted from',
                max_length=16,
            ),
        ),
    ]
