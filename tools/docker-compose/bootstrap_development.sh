#!/bin/bash
set +x

# Move to the source directory so we can bootstrap
if [ -f "/ascender_devel/manage.py" ]; then
    cd /ascender_devel
else
    echo "Failed to find the Ascender source tree, map your development tree volume"
fi

# Before anything runs a management command: STATICFILES_DIRS names this
# directory, and Django's system check warns once per command while it is
# missing. Creating it after the migrations meant that warning on every call up
# to that point.
mkdir -p /ascender_devel/ascender/ui/build/static

make ascender-link

if [[ -n "$RUN_MIGRATIONS" ]]; then
    # wait for postgres to be ready
    while ! nc -z postgres 5432; do
        echo "Waiting for postgres to be ready to accept connections"; sleep 1;
    done;
    make migrate
else
    wait-for-migrations
fi

if output=$(ascender-manage createsuperuser --noinput --username=admin --email=admin@localhost 2> /dev/null); then
    echo $output
fi
echo "Admin password: ${DJANGO_SUPERUSER_PASSWORD}"

ascender-manage create_preload_data
ascender-manage register_default_execution_environments

ascender-manage provision_instance --hostname="$(hostname)" --node_type="$MAIN_NODE_TYPE"
ascender-manage add_receptor_address --instance="$(hostname)" --address="$(hostname)" --port=2222 --canonical

ascender-manage register_queue --queuename=controlplane --instance_percent=100
ascender-manage register_queue --queuename=default --instance_percent=100

if [[ -n "$RUN_MIGRATIONS" ]]; then
    for (( i=1; i<$CONTROL_PLANE_NODE_COUNT; i++ )); do
        for (( j=i + 1; j<=$CONTROL_PLANE_NODE_COUNT; j++ )); do
            ascender-manage register_peers "ascender_$i" --peers "ascender_$j"
        done
    done

    if [[ $EXECUTION_NODE_COUNT > 0 ]]; then
        ascender-manage provision_instance --hostname="receptor-hop" --node_type="hop"
        ascender-manage add_receptor_address --instance="receptor-hop" --address="receptor-hop" --port=5555 --canonical
        ascender-manage register_peers "receptor-hop" --peers "ascender_1"
        for (( e=1; e<=$EXECUTION_NODE_COUNT; e++ )); do
            ascender-manage provision_instance --hostname="receptor-$e" --node_type="execution"
            ascender-manage register_peers "receptor-$e" --peers "receptor-hop"
        done
    fi
fi

# Create resource entries when using Minikube
if [[ -n "$MINIKUBE_CONTAINER_GROUP" ]]; then
    ascender-manage shell < /ascender_devel/tools/docker-compose-minikube/_sources/bootstrap_minikube.py
fi
