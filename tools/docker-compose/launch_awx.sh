#!/bin/bash
set +x

bootstrap_development.sh

cd /ascender_devel
# Start the services
exec make supervisor
