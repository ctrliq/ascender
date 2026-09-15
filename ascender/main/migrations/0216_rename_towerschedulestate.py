from django.db import migrations


class Migration(migrations.Migration):
    """Rename the scheduler's singleton, which was named for Tower.

    A model rename is a table rename, so it has to be said in a migration rather
    than only in the class: without this the table stays main_towerschedulestate
    and Django looks for main_ascenderschedulestate on the next query.
    """

    dependencies = [('main', '0215_alter_credentialtype_kind')]

    operations = [migrations.RenameModel(old_name='TowerScheduleState', new_name='AscenderScheduleState')]
