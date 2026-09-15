# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

try:
    from sos.plugins import Plugin, RedHatPlugin
except ImportError:
    from sos.report.plugins import Plugin, RedHatPlugin

SOSREPORT_CONTROLLER_COMMANDS = [
    "ascender-manage --version",  # controller version
    "ascender-manage list_instances",  # controller cluster configuration
    "ascender-manage run_dispatcher --status",  # controller dispatch worker status
    "ascender-manage run_callback_receiver --status",  # controller callback worker status
    "ascender-manage run_wsrelay --status",  # controller websocket relay status
    "supervisorctl status",  # controller process status
    "/var/lib/ascender/venv/awx/bin/pip freeze",  # pip package list
    "/var/lib/ascender/venv/awx/bin/pip freeze -l",  # pip package list without globally-installed packages
    "/var/lib/ascender/venv/ansible/bin/pip freeze",  # pip package list
    "/var/lib/ascender/venv/ansible/bin/pip freeze -l",  # pip package list without globally-installed packages
    "tree -d /var/lib/ascender",  # show me the dirs
    "ls -ll /var/lib/ascender",  # check permissions
    "ls -ll /var/lib/ascender/venv",  # list all venvs
    "ls -ll /etc/ascender",
    "ls -ll /var/run/ascender-receptor",  # list contents of dirctory where receptor socket should be
    "ls -ll /etc/receptor",
    "receptorctl --socket /var/run/ascender-receptor/receptor.sock status",  # Get information about the status of the mesh
    "umask -p",  # check current umask
]

SOSREPORT_CONTROLLER_DIRS = [
    "/etc/ascender/",
    "/etc/receptor/",
    "/etc/supervisord.conf",
    "/etc/supervisord.d/",
    "/etc/nginx/",
    "/var/log/ascender",
    "/var/log/nginx",
    "/var/log/supervisor",
    "/var/log/valkey",
    "/etc/valkey.conf",
    "/var/log/dist-upgrade",
    "/var/log/installer",
    "/var/log/unattended-upgrades",
    "/var/log/apport.log",
]

SOSREPORT_FORBIDDEN_PATHS = [
    "/etc/ascender/SECRET_KEY",
    "/etc/ascender/tower.key",
    "/etc/ascender/awx.key",
    "/etc/ascender/tower.cert",
    "/etc/ascender/awx.cert",
    "/var/log/ascender/profile",
    "/etc/receptor/tls/ca/*.key",
    "/etc/receptor/tls/*.key",
]


class Controller(Plugin, RedHatPlugin):
    '''Collect Ansible Automation Platform controller information'''

    plugin_name = "controller"
    short_desc = "Ansible Automation Platform controller information"

    def setup(self):
        for path in SOSREPORT_CONTROLLER_DIRS:
            self.add_copy_spec(path)

        for path in SOSREPORT_FORBIDDEN_PATHS:
            self.add_forbidden_path(path)

        self.add_cmd_output(SOSREPORT_CONTROLLER_COMMANDS)

    def postproc(self):
        # remove database password
        jreg = r"(\s*\'PASSWORD\'\s*:(\s))(?:\"){1,}(.+)(?:\"){1,}"
        repl = r"\1********"
        self.do_path_regex_sub("/etc/ascender/conf.d/postgres.py", jreg, repl)

        # remove email password
        jreg = r"(EMAIL_HOST_PASSWORD\s*=)\'(.+)\'"
        repl = r"\1********"
        self.do_path_regex_sub("/etc/ascender/settings.py", jreg, repl)

        # remove email password (if customized)
        jreg = r"(EMAIL_HOST_PASSWORD\s*=)\'(.+)\'"
        repl = r"\1********"
        self.do_path_regex_sub("/etc/ascender/conf.d/custom.py", jreg, repl)

        # remove websocket secret
        jreg = r"(BROADCAST_WEBSOCKET_SECRET\s*=\s*)\"(.+)\""
        repl = r"\1********"
        self.do_path_regex_sub("/etc/ascender/conf.d/channels.py", jreg, repl)
