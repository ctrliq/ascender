import type { Untyped } from 'types/api';
import Users from './Users';

describe('UsersAPI', () => {
  const userId = 1;
  const roleId = 7;
  let UsersAPI: Untyped;
  let mockHttp: Untyped;
  beforeEach(() => {
    const createPromise = () => Promise.resolve();
    mockHttp = { post: vi.fn(createPromise) };
    UsersAPI = new Users(mockHttp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('associate role calls post with expected params', async () => {
    await UsersAPI.associateRole(userId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0]).toEqual([
      `api/v2/users/${userId}/roles/`,
      { id: roleId },
    ]);
  });

  test('read users calls post with expected params', async () => {
    await UsersAPI.disassociateRole(userId, roleId);

    expect(mockHttp.post).toHaveBeenCalledTimes(1);
    expect(mockHttp.post.mock.calls[0]).toEqual([
      `api/v2/users/${userId}/roles/`,
      {
        id: roleId,
        disassociate: true,
      },
    ]);
  });
});
