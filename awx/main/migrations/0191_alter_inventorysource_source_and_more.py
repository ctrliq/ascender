# Generated by Django 4.2.15 on 2024-09-05 22:00

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0190_alter_inventorysource_source_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inventorysource',
            name='source',
            field=models.CharField(
                choices=[
                    ('file', 'File, Directory or Script'),
                    ('constructed', 'Template additional groups and hostvars at runtime'),
                    ('scm', 'Sourced from a Project'),
                    ('ec2', 'Amazon EC2'),
                    ('gce', 'Google Compute Engine'),
                    ('azure_rm', 'Microsoft Azure Resource Manager'),
                    ('vmware', 'VMware vCenter'),
                    ('openstack', 'OpenStack'),
                    ('terraform', 'Terraform State'),
                ],
                default=None,
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name='inventoryupdate',
            name='source',
            field=models.CharField(
                choices=[
                    ('file', 'File, Directory or Script'),
                    ('constructed', 'Template additional groups and hostvars at runtime'),
                    ('scm', 'Sourced from a Project'),
                    ('ec2', 'Amazon EC2'),
                    ('gce', 'Google Compute Engine'),
                    ('azure_rm', 'Microsoft Azure Resource Manager'),
                    ('vmware', 'VMware vCenter'),
                    ('openstack', 'OpenStack'),
                    ('terraform', 'Terraform State'),
                ],
                default=None,
                max_length=32,
            ),
        ),
    ]
