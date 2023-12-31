# Generated by Django 2.2.16 on 2021-04-13 19:51

from django.db import migrations, models

from awx.main.migrations._rbac import delete_all_custom_script_roles


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0137_custom_inventory_scripts_removal_data'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='activitystream',
            name='custom_inventory_script',
        ),
        migrations.RemoveField(
            model_name='inventorysource',
            name='source_script',
        ),
        migrations.RemoveField(
            model_name='inventoryupdate',
            name='source_script',
        ),
        migrations.AlterField(
            model_name='inventorysource',
            name='source',
            field=models.CharField(
                choices=[
                    ('file', 'File, Directory or Script'),
                    ('scm', 'Sourced from a Project'),
                    ('ec2', 'Amazon EC2'),
                    ('gce', 'Google Compute Engine'),
                    ('azure_rm', 'Microsoft Azure Resource Manager'),
                    ('vmware', 'VMware vCenter'),
                    ('satellite6', 'Red Hat Satellite 6'),
                    ('openstack', 'OpenStack'),
                    ('rhv', 'Red Hat Virtualization'),
                    ('tower', 'Ansible Tower'),
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
                    ('scm', 'Sourced from a Project'),
                    ('ec2', 'Amazon EC2'),
                    ('gce', 'Google Compute Engine'),
                    ('azure_rm', 'Microsoft Azure Resource Manager'),
                    ('vmware', 'VMware vCenter'),
                    ('satellite6', 'Red Hat Satellite 6'),
                    ('openstack', 'OpenStack'),
                    ('rhv', 'Red Hat Virtualization'),
                    ('tower', 'Ansible Tower'),
                ],
                default=None,
                max_length=32,
            ),
        ),
        migrations.AlterUniqueTogether(
            name='custominventoryscript',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='custominventoryscript',
            name='admin_role',
        ),
        migrations.RemoveField(
            model_name='custominventoryscript',
            name='organization',
        ),
        migrations.RemoveField(
            model_name='custominventoryscript',
            name='read_role',
        ),
        migrations.RunPython(delete_all_custom_script_roles),
    ]
