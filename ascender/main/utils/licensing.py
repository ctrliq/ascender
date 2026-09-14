# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

'''
This is intended to be a lightweight license class for verifying subscriptions, and parsing subscription data
from entitlement certificates.

The Licenser class can do the following:
 - Parse an Entitlement cert to generate license
'''

import base64
from datetime import datetime, timezone
import copy
import io
import os
import json
import logging
import re
import time
import zipfile

from dateutil.parser import parse as parse_date

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509

# Django
from ascender.settings.typed import settings
from django.utils.translation import gettext_lazy as _

from ascender.main.constants import SUBSCRIPTION_USAGE_MODEL_UNIQUE_HOSTS

MAX_INSTANCES = 9999999

# Named rather than derived from __name__: the logger names stay awx.* while
# the package is ascender.*, so LOGGING and anything filtering on them keep
# matching. The diagnostic names move in their own change.
logger = logging.getLogger('awx.main.utils.licensing')

#: What the product calls itself, unsubscribed and subscribed. These are read
#: back by callers deciding which product they are, so they are constants rather
#: than literals repeated at each site: a comparison against a spelling is the
#: kind of thing a rename breaks silently, by flipping a branch rather than
#: failing.
OPEN_PRODUCT_NAME = 'Ascender'
SUBSCRIPTION_PRODUCT_NAME = 'Red Hat Ansible Automation Platform'


def validate_entitlement_manifest(data):
    buff = io.BytesIO()
    buff.write(base64.b64decode(data))
    try:
        z = zipfile.ZipFile(buff)
    except zipfile.BadZipFile as e:
        raise ValueError(_("Invalid manifest: a subscription manifest zip file is required.")) from e
    buff = io.BytesIO()

    files = z.namelist()
    if 'consumer_export.zip' not in files or 'signature' not in files:
        raise ValueError(_("Invalid manifest: missing required files."))
    export = z.open('consumer_export.zip').read()
    sig = z.open('signature').read()
    with open('/etc/ascender/candlepin-redhat-ca.crt', 'rb') as f:
        cert = x509.load_pem_x509_certificate(f.read(), backend=default_backend())
        key = cert.public_key()
    try:
        key.verify(sig, export, padding=padding.PKCS1v15(), algorithm=hashes.SHA256())
    except InvalidSignature as e:
        raise ValueError(_("Invalid manifest: signature verification failed.")) from e

    buff.write(export)
    z = zipfile.ZipFile(buff)
    subs = []
    for f in z.filelist:
        if f.filename.startswith('export/entitlements') and f.filename.endswith('.json'):
            subs.append(json.loads(z.open(f).read()))
    if subs:
        return subs
    raise ValueError(_("Invalid manifest: manifest contains no subscriptions."))


class OpenLicense(object):
    def validate(self):
        return dict(
            license_type='open',
            valid_key=True,
            subscription_name='OPEN',
            product_name=OPEN_PRODUCT_NAME,
        )


class Licenser(object):
    # warn when there is a month (30 days) left on the subscription
    SUBSCRIPTION_TIMEOUT = 60 * 60 * 24 * 30

    UNLICENSED_DATA = dict(
        subscription_name=None,
        sku=None,
        support_level=None,
        instance_count=0,
        license_date=0,
        license_type="UNLICENSED",
        product_name=SUBSCRIPTION_PRODUCT_NAME,
        valid_key=False,
    )

    def __init__(self, **kwargs):
        self._attrs = dict(
            instance_count=0,
            license_date=0,
            license_type='UNLICENSED',
        )
        if not kwargs:
            license_setting = getattr(settings, 'LICENSE', None)
            if license_setting is not None:
                kwargs = license_setting

        if 'company_name' in kwargs:
            kwargs.pop('company_name')
        self._attrs.update(kwargs)
        if 'valid_key' in self._attrs:
            if not self._attrs['valid_key']:
                self._unset_attrs()
        else:
            self._unset_attrs()

    def _unset_attrs(self):
        self._attrs = self.UNLICENSED_DATA.copy()

    def license_from_manifest(self, manifest):
        def is_appropriate_manifest_sub(sub):
            if sub['pool']['activeSubscription'] is False:
                return False
            now = datetime.now(timezone.utc)
            if parse_date(sub['startDate']) > now:
                return False
            if parse_date(sub['endDate']) < now:
                return False
            products = sub['pool']['providedProducts']
            if any(product.get('productId') == '480' for product in products):
                return True
            return False

        def _can_aggregate(sub, license):
            # We aggregate multiple subs into a larger meta-sub, if they match
            #
            # No current sub in aggregate
            if not license:
                return True
            # Same SKU type (SER vs MCT vs others)?
            if license['sku'][0:3] != sub['pool']['productId'][0:3]:
                return False
            return True

        # Parse output for subscription metadata to build config
        license = dict()
        for sub in manifest:
            if not is_appropriate_manifest_sub(sub):
                logger.warning("Subscription %s (%s) in manifest is not active or for another product" % (sub['pool']['productName'], sub['pool']['productId']))
                continue
            if not _can_aggregate(sub, license):
                logger.warning(
                    "Subscription %s (%s) in manifest does not match other manifest subscriptions" % (sub['pool']['productName'], sub['pool']['productId'])
                )
                continue

            license.setdefault('sku', sub['pool']['productId'])
            license.setdefault('subscription_name', sub['pool']['productName'])
            license.setdefault('subscription_id', sub['pool']['subscriptionId'])
            license.setdefault('account_number', sub['pool']['accountNumber'])
            license.setdefault('pool_id', sub['pool']['id'])
            license.setdefault('product_name', sub['pool']['productName'])
            license.setdefault('valid_key', True)
            if sub['pool']['productId'].startswith('S'):
                license.setdefault('trial', True)
                license.setdefault('license_type', 'trial')
            else:
                license.setdefault('trial', False)
                license.setdefault('license_type', 'enterprise')
            license.setdefault('satellite', False)
            # Use the nearest end date
            endDate = parse_date(sub['endDate'])
            currentEndDateStr = license.get('license_date', '4102462800')  # 2100-01-01
            currentEndDate = datetime.fromtimestamp(int(currentEndDateStr), timezone.utc)
            if endDate < currentEndDate:
                license['license_date'] = endDate.strftime('%s')
            instances = sub['quantity']
            license['instance_count'] = license.get('instance_count', 0) + instances
            license['subscription_name'] = re.sub(r'[\d]* Managed Nodes', '%d Managed Nodes' % license['instance_count'], license['subscription_name'])

            license['support_level'] = ''
            license['usage'] = ''
            for attr in sub['pool'].get('productAttributes', []):
                if attr.get('name') == 'support_level':
                    license['support_level'] = attr.get('value')
                elif attr.get('name') == 'usage':
                    license['usage'] = attr.get('value')
                elif attr.get('name') == 'ph_product_name' and attr.get('value') == 'RHEL Developer':
                    license['license_type'] = 'developer'

        if not license:
            logger.error("No valid subscriptions found in manifest")
        self._attrs.update(license)
        settings.LICENSE = self._attrs
        return self._attrs

    def update(self, **kwargs):
        # Update attributes of the current license.
        if 'instance_count' in kwargs:
            kwargs['instance_count'] = int(kwargs['instance_count'])
        if 'license_date' in kwargs:
            kwargs['license_date'] = int(kwargs['license_date'])
        self._attrs.update(kwargs)

    def validate(self):
        # Return license attributes with additional validation info.
        attrs = copy.deepcopy(self._attrs)
        type = attrs.get('license_type', 'none')

        if type == 'UNLICENSED' or False:
            attrs.update(dict(valid_key=False, compliant=False))
            return attrs
        attrs['valid_key'] = True

        from ascender.main.models import Host, HostMetric, Instance

        current_instances = Host.objects.active_count()
        license_date = int(attrs.get('license_date', 0) or 0)

        subscription_model = getattr(settings, 'SUBSCRIPTION_USAGE_MODEL', '')
        if subscription_model == SUBSCRIPTION_USAGE_MODEL_UNIQUE_HOSTS:
            automated_instances = HostMetric.active_objects.count()
            first_host = HostMetric.active_objects.only('first_automation').order_by('first_automation').first()
            attrs['deleted_instances'] = HostMetric.objects.filter(deleted=True).count()
            attrs['reactivated_instances'] = HostMetric.active_objects.filter(deleted_counter__gte=1).count()
        else:
            automated_instances = 0
            first_host = HostMetric.objects.only('first_automation').order_by('first_automation').first()
            attrs['deleted_instances'] = 0
            attrs['reactivated_instances'] = 0

        if first_host:
            automated_since = int(first_host.first_automation.timestamp())
        else:
            automated_since = int(Instance.objects.order_by('id').first().created.timestamp())
        instance_count = int(attrs.get('instance_count', 0))
        attrs['current_instances'] = current_instances
        attrs['automated_instances'] = automated_instances
        attrs['automated_since'] = automated_since
        free_instances = instance_count - automated_instances
        attrs['free_instances'] = max(0, free_instances)

        current_date = int(time.time())
        time_remaining = license_date - current_date
        attrs['time_remaining'] = time_remaining
        if attrs.setdefault('trial', False):
            attrs['grace_period_remaining'] = time_remaining
        else:
            attrs['grace_period_remaining'] = (license_date + 2592000) - current_date
        attrs['compliant'] = bool(time_remaining > 0 and free_instances >= 0)
        attrs['date_warning'] = bool(time_remaining < self.SUBSCRIPTION_TIMEOUT)
        attrs['date_expired'] = bool(time_remaining <= 0)
        return attrs


def get_licenser(*args, **kwargs):
    from ascender.main.utils.licensing import Licenser, OpenLicense

    try:
        # .tower_version keeps its name deliberately. Its presence is what says
        # this is the subscription product rather than the open one, and nothing
        # in this ecosystem writes it: an install that has it got it from the
        # Tower it was migrated from. Renaming the check would silently move
        # such an install onto the open licence.
        if os.path.exists('/var/lib/ascender/.tower_version'):
            return Licenser(*args, **kwargs)
        else:
            return OpenLicense()
    except Exception as e:
        raise ValueError(_('Error importing License: %s') % e)


def server_product_name():
    return OPEN_PRODUCT_NAME if isinstance(get_licenser(), OpenLicense) else SUBSCRIPTION_PRODUCT_NAME
