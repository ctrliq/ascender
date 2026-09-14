#!/bin/bash
set +x

cd /ascender_devel
make clean
make ascender-link

if [[ ! $@ ]]; then
    make test
else
    make $@
fi
