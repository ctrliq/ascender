import { MAPPING_KEYS } from '../Setting/Mapping/keys';
import { PASSWORD_KEYS } from '../Setting/Password/keys';
import { TOKEN_KEYS } from '../Setting/Tokens/keys';

/**
 * The settings page each category of settings is shown on, by the category's
 * slug, which is what the activity stream names a changed setting's category
 * with. The sign in methods split one provider over several slugs (GitHub has
 * six, Azure two), and all of them are shown on the one provider page.
 */
const CATEGORY_PAGES: Record<string, string> = {
  ui: '/appearance',
  jobs: '/job_settings',
  logging: '/logging',
  system: '/system',
  debug: '/troubleshooting',
  'azuread-oauth2': '/authentication/azure',
  'azuread-oauth2-tenant': '/authentication/azure',
  github: '/authentication/github',
  'github-org': '/authentication/github',
  'github-team': '/authentication/github',
  'github-enterprise': '/authentication/github',
  'github-enterprise-org': '/authentication/github',
  'github-enterprise-team': '/authentication/github',
  'google-oauth2': '/authentication/google_oauth2',
  ldap: '/authentication/ldap',
  oidc: '/authentication/oidc',
  saml: '/authentication/saml',
};

/**
 * Where a changed setting can be seen, or null where no page shows it.
 *
 * Most categories have a page of their own. The authentication category is
 * the exception: its settings are spread over four tabs, so those are told
 * apart by the setting's name, and anything none of the tabs names goes to the
 * session tab, which holds the rest of the category. A category no page shows,
 * such as the bulk API limits, gets no link rather than one to a page that
 * does not have it.
 */
export default function settingUrl(
  setting: { name?: unknown; category?: unknown } | undefined
): string | null {
  const category = String(setting?.category ?? '');
  const name = String(setting?.name ?? '');

  if (category === 'authentication') {
    if (PASSWORD_KEYS.includes(name)) {
      return '/authentication/password';
    }
    if (TOKEN_KEYS.includes(name)) {
      return '/authentication/tokens';
    }
    if (MAPPING_KEYS.includes(name)) {
      return '/authentication/mapping';
    }
    return '/authentication/session';
  }

  return CATEGORY_PAGES[category] ?? null;
}
