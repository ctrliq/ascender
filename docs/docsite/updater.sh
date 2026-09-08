#!/bin/sh
set -ue

venv="`pwd`/venv"
echo $venv
/usr/bin/python3.14 -m venv "${venv}"
# shellcheck disable=SC1090
source ${venv}/bin/activate

${venv}/bin/python3 -m pip install -U uv

# uv resolves the same tree as pip-compile. --upgrade, --no-header, --quiet and
# --output-file carry over unchanged; -r, the rebuild flag, is --refresh; and
# --allow-unsafe has no counterpart because uv emits pip and setuptools by
# default. Matches requirements/updater.sh, which moved in #899.
uv pip compile --upgrade --no-header --quiet --refresh requirements.in --output-file requirements.txt

rm -fr "${venv}"
echo "Updated requirements.txt with latest dependencies."
