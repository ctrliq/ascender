# Copyright (c) 2026 Ascender contributors
# All Rights Reserved.

"""
Logins through Microsoft Entra ID, which was called Azure Active Directory
until 2023.

The older Azure AD backends talk to the v1 endpoints, take anyone from any
directory unless a tenant is given, and know a user by a name that can be
handed to someone else.  This one goes through the v2.0 endpoints of a single
tenant, on whichever Microsoft cloud the tenant lives in, and knows a user by
their object ID, which never changes nor is reused.  Groups, app roles and the
rest of the token's claims are handed to the same maps and rules as generic
OIDC, in ascender.sso.oidc.  The groups can also be read from Microsoft Graph
instead of the token, which has room for 200 of them and names them by ID.
"""

import logging
from urllib.parse import urlsplit

from social_core.backends.azuread_tenant import AzureADV2TenantOAuth2
from social_core.exceptions import AuthMissingParameter

logger = logging.getLogger('ascender.sso.entra')

ENTRA_ID_BACKEND_NAME = 'entra-id'

#: The public cloud's sign in host.  Sovereign clouds and External ID tenants
#: have their own.
DEFAULT_AUTHORITY_HOST = 'login.microsoftonline.com'

#: What Entra accepts in place of a tenant to let in users of any directory, or
#: of any personal Microsoft account.  This backend is for one tenant's users.
MULTI_TENANT_IDS = frozenset(('common', 'organizations', 'consumers'))

#: The Microsoft Graph host of each cloud, by the cloud's sign in host.  Any
#: other sign in host, an External ID tenant's for one, is in the public cloud.
GRAPH_HOSTS = {
    'login.microsoftonline.com': 'graph.microsoft.com',
    'login.microsoftonline.us': 'graph.microsoft.us',
    'login.partner.microsoftonline.cn': 'microsoftgraph.chinacloudapi.cn',
}
DEFAULT_GRAPH_HOST = 'graph.microsoft.com'

#: The delegated permission that lets the signed in user's groups be read with
#: their names.
GRAPH_GROUPS_PERMISSION = 'GroupMember.Read.All'

#: Graph hands out up to 999 groups a page.  This many pages is far more groups
#: than anyone is in, and keeps a login from paging forever.
GRAPH_MAX_PAGES = 50


class EntraIDOAuth2(AzureADV2TenantOAuth2):
    name = ENTRA_ID_BACKEND_NAME
    # Without offline_access no refresh token is handed out, nothing here would
    # ever use one.
    DEFAULT_SCOPE = ['openid', 'profile', 'email']

    @property
    def authority_host(self):
        return self.setting('AUTHORITY_HOST', '') or DEFAULT_AUTHORITY_HOST

    @property
    def tenant_id(self):
        # With one of the multi tenant names the issuer Entra advertises has a
        # placeholder in it, which the token's own tenant fills in, so tokens of
        # every directory would pass.
        tenant_id = (self.setting('TENANT_ID', '') or '').strip()
        if not tenant_id or tenant_id.lower() in MULTI_TENANT_IDS:
            raise AuthMissingParameter(self, 'TENANT_ID')
        return tenant_id

    @property
    def graph_host(self):
        return self.setting('GRAPH_HOST', '') or GRAPH_HOSTS.get(self.authority_host.lower(), DEFAULT_GRAPH_HOST)

    def groups_from_graph(self):
        return bool(self.setting('GROUPS_FROM_GRAPH', False))

    def get_scope(self):
        scope = super().get_scope()
        if self.groups_from_graph():
            # Named with its resource, so that outside the public cloud the
            # access token is for that cloud's Graph.
            scope = scope + ['https://{}/{}'.format(self.graph_host, GRAPH_GROUPS_PERMISSION)]
        return scope

    def user_data(self, access_token, *args, **kwargs):
        data = super().user_data(access_token, *args, **kwargs)
        if data is not None and self.groups_from_graph():
            data = self.with_graph_groups(data, access_token)
        return data

    def with_graph_groups(self, claims, access_token):
        """
        The claims with the groups the token carries replaced by the ones Graph knows.

        The groups end up in the groups claim, every one of them both by its
        object ID and by its name, so rules can name either.  Graph lists nested
        memberships too and has no limit on how many, where a token stops at
        200 and then names no group at all.  If Graph cannot be asked, the
        groups are left out altogether, so that rules on them treat the user's
        groups as unknown rather than going by the token's partial list or by
        none.
        """
        claims = dict(claims)
        claims.pop('groups', None)
        claim_names = claims.get('_claim_names')
        if isinstance(claim_names, dict) and 'groups' in claim_names:
            # The token's pointer to where the groups that did not fit are.
            # Left in place it would make the groups read as unknown.
            claims['_claim_names'] = {name: source for name, source in claim_names.items() if name != 'groups'}
        try:
            claims['groups'] = self.fetch_graph_groups(access_token)
        except Exception as error:
            logger.error("Could not read the groups of %s from Microsoft Graph, rules on groups will not apply to this login: %s", claims.get('oid'), error)
        return claims

    def fetch_graph_groups(self, access_token):
        """Every group the signed in user is a member of, directly or not, by ID and by name."""
        url = 'https://{}/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id,displayName&$top=999'.format(self.graph_host)
        groups = {}
        for _ in range(GRAPH_MAX_PAGES):
            page = self.get_json(url, headers={'Authorization': 'Bearer {}'.format(access_token), 'Accept': 'application/json'})
            for group in page.get('value') or []:
                for value in (group.get('id'), group.get('displayName')):
                    if isinstance(value, str) and value:
                        groups[value] = None
            url = page.get('@odata.nextLink')
            if not url:
                return list(groups)
            # The access token goes wherever the next page is, so that has to
            # be the Graph it was meant for.
            next_page = urlsplit(url)
            if next_page.scheme != 'https' or next_page.hostname != self.graph_host.lower():
                raise ValueError('Microsoft Graph pointed the next page at {}'.format(next_page.hostname))
        # Part of the groups is worse than none: a has_not rule would let in
        # someone whose excluded group was on a page never read.
        raise ValueError('more than {} pages of groups'.format(GRAPH_MAX_PAGES))

    def get_user_id(self, details, response):
        # The object ID, unlike the user principal name the Azure AD v2 backend
        # goes by, stays with the user when they are renamed and is never given
        # to anyone else.
        oid = response.get('oid')
        if not oid:
            raise AuthMissingParameter(self, 'oid')
        return oid

    def get_user_details(self, response):
        preferred_username = response.get('preferred_username')
        username = response.get(self.setting('USERNAME_KEY', '') or 'preferred_username') or preferred_username
        # The email claim is optional in Entra and only there for users with a
        # mailbox.  The user principal name looks like an address and very often
        # is one, so it stands in.
        email = response.get('email') or (preferred_username if isinstance(preferred_username, str) and '@' in preferred_username else '')
        return {
            'username': username,
            'email': email,
            'fullname': response.get('name', ''),
            'first_name': response.get('given_name', ''),
            'last_name': response.get('family_name', ''),
        }
