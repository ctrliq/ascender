# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

"""What licence this product has, which is one answer.

There used to be a Licenser here that parsed an entitlement certificate and
decided whether a subscription was valid and in date. Ascender does not have a
subscription, so the only licence is the open one and this says so.
"""

import logging

from django.utils.translation import gettext_lazy as _  # noqa: F401

MAX_INSTANCES = 9999999

# Named rather than derived from __name__: the logger names stay awx.* while
# the package is ascender.*, so LOGGING and anything filtering on them keep
# matching. The diagnostic names move in their own change.
logger = logging.getLogger('awx.main.utils.licensing')

#: What the product calls itself. A constant rather than a literal repeated at
#: each site, because callers compare against it as well as print it, and a
#: comparison against a spelling is the kind of thing a rename breaks silently.
OPEN_PRODUCT_NAME = 'Ascender'


class OpenLicense(object):
    def validate(self):
        return dict(
            license_type='open',
            valid_key=True,
            subscription_name='OPEN',
            product_name=OPEN_PRODUCT_NAME,
        )


def get_licenser(*args, **kwargs):
    """The licence this product has, which is the open one.

    There used to be a second answer here, chosen by whether
    /var/lib/ascender/.tower_version existed: present meant the subscription
    product and an entitlement manifest to validate. Nothing in this ecosystem
    ever wrote that file, so the branch was only ever reachable on an install
    carried over from Tower, and Ascender does not have a subscription to check.
    """
    return OpenLicense()


def server_product_name():
    return OPEN_PRODUCT_NAME
