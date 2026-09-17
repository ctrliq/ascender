#!/usr/bin/env bash
if [ `id -u` -ge 500 ]; then
    echo "awx:x:`id -u`:`id -g`:,,,:/var/lib/ascender:/bin/bash" >> /tmp/passwd
    cat /tmp/passwd > /etc/passwd
    rm /tmp/passwd
fi

# Either name: the variable is set outside this tree, so the new one cannot be
# rolled out with this file. Non-empty if either is set.
if [ -n "${ASCENDER_KUBE_DEVEL}${AWX_KUBE_DEVEL}" ]; then
    pushd /ascender_devel
    make ascender-link
    popd

    export SDB_NOTIFY_HOST=$MY_POD_IP
fi

set -e

wait-for-migrations

# This file will be re-written when the dispatcher calls reconfigure_rsyslog(),
# but it needs to exist when supervisor initially starts rsyslog to prevent the
# container from crashing. This was the most minimal config I could get working.
cat << EOF > /var/lib/ascender/rsyslog/rsyslog.conf
action(type="omfile" file="/dev/null")
EOF

exec supervisord -c /etc/supervisord_rsyslog.conf

