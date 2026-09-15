{% ifmeth GET %}
# Site configuration settings and general information

Make a GET request to this resource to retrieve the configuration containing
the following fields (some fields may not be visible to all users):

* `project_base_dir`: Path on the server where projects and playbooks are \
  stored.
* `project_local_paths`: List of directories beneath `project_base_dir` to
  use when creating/editing a manual project.
* `time_zone`: The configured time zone for the server.
* `version`: Version of the Ascender package installed.
* `analytics_status`: Whether user analytics tracking is off, anonymous or
  detailed.
* `become_methods`: The privilege escalation methods available to a job.
* `user_ldap_fields`: Present when LDAP is enabled: the user fields LDAP
  manages, which are read-only for a user with an `ldap_dn`.
{% endifmeth %}

{% ifmeth POST %}
# No licence to install

Ascender does not use subscriptions. This method took a Red Hat entitlement
manifest and answers `400` instead, rather than a bare `405`, so a client that
posts one is told why.
{% endifmeth %}

{% ifmeth DELETE %}
# No licence to remove

Ascender does not use subscriptions. This method cleared the installed licence
and answers `400`, the same way POST does.
{% endifmeth %}
