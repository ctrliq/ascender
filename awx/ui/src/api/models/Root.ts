import Base from '../Base';
import type { Http } from '../Base';

/** The api root, which the login screen reads the branding out of. */
export interface ApiRoot {
  custom_logo?: string | null;
  custom_login_info?: string | null;
  custom_title?: string | null;
  description?: string;
  current_version?: string;
  available_versions?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * The strings the brand is built from, bundled as a static asset.
 *
 * Every screen that names the product reads it from here rather than from a
 * literal, which is what lets a rebrand change one file.
 */
export interface AssetVariables {
  BRAND_NAME: string;
  [key: string]: unknown;
}

class Root extends Base<ApiRoot> {
  redirectURL: string;

  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/';
    this.redirectURL = 'api/v2/config/';
  }

  // The root answers with one object rather than a page of them.
  read<T = ApiRoot>() {
    return this.http.get<T>(this.baseUrl);
  }

  async login(
    username: string,
    password: string,
    redirect: string = this.redirectURL
  ) {
    const loginUrl = `${this.baseUrl}login/`;
    const un = encodeURIComponent(username);
    const pw = encodeURIComponent(password);

    // Ensure 'next' is an absolute path based on the current location
    const next = encodeURIComponent(
      redirect.startsWith('/')
        ? redirect
        : `${window.location.pathname.replace(/\/$/, '')}/${redirect}`
    );

    const data = `username=${un}&password=${pw}&next=${next}`;
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    await this.http.get(loginUrl, { headers });
    const response = await this.http.post(loginUrl, data, { headers });

    return response;
  }

  logout() {
    return this.http.post(`${this.baseUrl}logout/`);
  }

  readAssetVariables() {
    // TODO: There's better ways of doing this. Build tools, scripts,
    // automation etc. should relocate this variable file to an importable
    // location in src prior to building. That said, a raw http call
    // works for now.
    return this.http.get<AssetVariables>('static/media/default.strings.json');
  }
}

export default Root;
