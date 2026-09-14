#!/bin/bash
set +x

cd /ascender_devel
make clean
make awx-link

if [[ ! $@ ]]; then
    make test
else
    make $@
fi
