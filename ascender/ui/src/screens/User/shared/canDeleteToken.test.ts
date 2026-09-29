import type { OAuth2Token } from 'types/api';
import canDeleteToken from './canDeleteToken';

const token = (
  summaryFields: Record<string, unknown>
): Pick<OAuth2Token, 'summary_fields'> =>
  ({ summary_fields: summaryFields }) as Pick<OAuth2Token, 'summary_fields'>;

const appToken = token({ user: { id: 1 }, application: { id: 3, name: 'hg' } });
const personalToken = token({ user: { id: 1 }, application: null });
const viewer = { id: 7, is_superuser: false };

describe('canDeleteToken', () => {
  test('a superuser or the owner may delete any token', () => {
    expect(
      canDeleteToken(personalToken, { id: 7, is_superuser: true }, 0)
    ).toBe(true);
    expect(canDeleteToken(personalToken, { id: 1 }, 0)).toBe(true);
  });

  test("nobody else may delete another user's personal token", () => {
    expect(canDeleteToken(personalToken, viewer, 3)).toBe(false);
  });

  test("the application's capability settles an application token", () => {
    expect(canDeleteToken(appToken, viewer, 1, false)).toBe(false);
    expect(canDeleteToken(appToken, viewer, 0, true)).toBe(true);
  });

  test('a capability on the token application reference is used', () => {
    const withCaps = token({
      user: { id: 1 },
      application: { id: 3, user_capabilities: { delete: false } },
    });
    expect(canDeleteToken(withCaps, viewer, 1)).toBe(false);
  });

  test('without either, any organization admin is offered it', () => {
    expect(canDeleteToken(appToken, viewer, 1)).toBe(true);
    expect(canDeleteToken(appToken, viewer, 0)).toBe(false);
  });
});
