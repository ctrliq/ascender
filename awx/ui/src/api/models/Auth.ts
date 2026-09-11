import Base from '../Base';
import type { Http } from '../Base';

/** One social or enterprise login the server offers, by its backend name. */
export interface AuthProvider {
  login_url: string;
  complete_url?: string;
  metadata_url?: string;
  type?: string;
  /** Set for an enterprise login, which names the organization it signs in. */
  label?: string;
}

/** Every login the server offers besides the username and password form. */
export type AuthProviders = Record<string, AuthProvider>;

class Auth extends Base<AuthProviders> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/auth/';
  }

  // The providers come back as one object keyed by backend, not as a page.
  read<T = AuthProviders>() {
    return this.http.get<T>(this.baseUrl);
  }
}

export default Auth;
