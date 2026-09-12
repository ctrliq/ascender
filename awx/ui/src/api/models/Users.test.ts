import type { Mock } from 'vitest';
import type { Http } from '../Base';
import Users from './Users';

describe('UsersAPI', () => {
  const userId = 1;
  const roleId = 7;
  let UsersAPI: Users;
  // Only the methods this model calls, each a vi.fn so its calls can be read.
  let mockHttp: Partial<Record<keyof Http, Mock>>;
  beforeEach(() => {
    const createPromise = () => Promise.resolve();
    mockHttp = { post: vi.fn(createPromise) };
    UsersAPI = new Users(mockHttp as unknown as Http);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('associate role calls post with expected params', async () => {
    await UsersAPI.associateRole(userId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post?.mock.calls[0]).toEqual([
      `api/v2/users/${userId}/roles/`,
      { id: roleId },
    ]);
  });

  test('read users calls post with expected params', async () => {
    await UsersAPI.disassociateRole(userId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post?.mock.calls[0]).toEqual([
      `api/v2/users/${userId}/roles/`,
      {
        id: roleId,
        disassociate: true,
      },
    ]);
  });
});
