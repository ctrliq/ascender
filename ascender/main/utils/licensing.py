# Copyright (c) 2015 Ascender
# All Rights Reserved.

"""What this product calls itself.

There used to be a Licenser here that parsed an entitlement certificate and
decided whether a subscription was valid and in date, and an OpenLicense that
answered for everything else. Ascender has no subscription, so the second
answered every time and the first was unreachable. Both are gone, and what is
left is the one thing callers still needed from them: the name.

A constant rather than a literal repeated at each site, because callers compare
against it as well as print it, and a comparison against a spelling is the kind
of thing a rename breaks silently.
"""

#: What the product calls itself, served as the X-API-Product-Name header. The
#: brand the UI shows is a separate thing, BRAND_NAME in default.strings.json,
#: so that white-labelling an install does not have to touch this.
OPEN_PRODUCT_NAME = 'Ascender'


def server_product_name():
    return OPEN_PRODUCT_NAME
