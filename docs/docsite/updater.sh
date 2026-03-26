#!/bin/sh
set -ue

venv="`pwd`/venv"
echo $venv
/usr/bin/python3.12 -m venv "${venv}"
# shellcheck disable=SC1090
source ${venv}/bin/activate

${venv}/bin/python3 -m pip install -U pip-tools

pip-compile --upgrade --no-header --quiet -r --allow-unsafe requirements.in --output-file requirements.txt

rm -fr "${venv}"
echo "Updated requirements.txt with latest dependencies."