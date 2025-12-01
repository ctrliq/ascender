import json


def survey_password_variables(survey_spec):
    vars = []
    # Handle cases where survey_spec might be a string, empty, or None
    if not survey_spec:
        return vars
    
    # If survey_spec is a string, try to parse it as JSON
    if isinstance(survey_spec, str):
        try:
            survey_spec = json.loads(survey_spec)
        except (json.JSONDecodeError, ValueError):
            return vars
    
    # Ensure survey_spec is a dict and has 'spec' key
    if not isinstance(survey_spec, dict) or 'spec' not in survey_spec:
        return vars
    
    # Get variables that are type password
    for survey_element in survey_spec['spec']:
        if 'type' in survey_element and survey_element['type'] == 'password':
            vars.append(survey_element['variable'])
    return vars


def migrate_survey_passwords(apps, schema_editor):
    """Take the output of the Job Template password list for all that
    have a survey enabled, and then save it into the job model.
    """
    Job = apps.get_model('main', 'Job')
    for job in Job.objects.iterator():
        if not job.job_template:
            continue
        jt = job.job_template
        if jt.survey_spec is not None and jt.survey_enabled:
            password_list = survey_password_variables(jt.survey_spec)
            hide_password_dict = {}
            for password in password_list:
                hide_password_dict[password] = "$encrypted$"
            job.survey_passwords = hide_password_dict
            job.save()
