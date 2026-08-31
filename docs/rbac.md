# Role-Based Access Control (RBAC)

This codebase uses the original AWX role-based access control system: the
`Role` model and `ImplicitRoleField` in `awx/main/models/rbac.py`, with access
rules in `awx/main/access.py`.

(Upstream AWX later moved its RBAC system into the django-ansible-base
library; this fork did not follow that move. The parts of django-ansible-base
this codebase does use are vendored under `awx/dab/` — see
`awx/dab/VENDORED.md` — and its RBAC app is not among them. Gateway-issued
JWT claims are mapped onto the old role fields via
`ROLE_DEFINITION_TO_ROLE_FIELD` in `awx/main/models/rbac.py`.)

## Overview

### RBAC - System Basics

![Example RBAC hierarchy](img/rbac_example.png?raw=true)
